"""Move a site from `ding` and/or `smartflo` to mith_calling + mith_field_sales (owner-approved, 2026-10-24).

ding was split: its calling part (module `ding`) became mith_calling, its Field Sales module became
mith_field_sales, and the smartflo app was merged into mith_calling as the Smartflo module.

A site that still lists ding or smartflo in its installed apps cannot migrate once the old folders
are gone, and migrate only runs patches of installed apps (and `bench execute` refuses an app that is
not installed). So on such a site, with both new apps on the bench, run this once before the first
migrate (the commands are in mith_calling/commands.py):

    bench --site <site> rename-from-ding        # or rename-from-smartflo: the same patch
    bench --site <site> migrate

The migrate then records this patch (it is in patches.txt); on any other site it does nothing.

What moves: the installed-apps list (ding becomes both new apps, smartflo becomes mith_calling),
Installed Application rows, Module Def records with every link to them, app fields on desk records
(Desktop Icon, Workspace Sidebar, Desktop Layout …), Patch Log entries (so old patches don't run again)
and dotted method paths. Scheduled Job Types of the old apps are deleted; migrate creates them again.
"""

import json

import frappe

# old app -> the apps that replace it
APPS = {"ding": ["mith_calling", "mith_field_sales"], "smartflo": ["mith_calling"]}
# old module -> (new module, its app)
MODULES = {
	"ding": ("Mith Calling", "mith_calling"),
	"Field Sales": ("Mith Field Sales", "mith_field_sales"),
	"Tatatelebiz Smartflo integration": ("Smartflo", "mith_calling"),
}
# dotted-path prefixes, most specific first (no new prefix starts with an old one)
PREFIXES = [
	("ding.field_sales.", "mith_field_sales.mith_field_sales."),
	("ding.ding.", "mith_calling.mith_calling."),
	("ding.patches.", "mith_field_sales.patches."),  # every ding patch was a field-sales patch
	("ding.", "mith_calling."),
	("smartflo.tatatelebiz_smartflo_integration.", "mith_calling.smartflo."),
	("smartflo.", "mith_calling."),
]
# ding's custom fields that belong to field sales (created with module "ding")
FIELD_SALES_CUSTOM_FIELDS = ("Customer-customer_geolocation", "Lead-lead_geolocation", "Contact-contact_geolocation")

# Desk doctypes that store an app name (Frappe v16)
APP_FIELDS = [
	("Desktop Icon", "app"),
	("Dock", "app"),
	("Sidebar", "app"),
	("Sidebar Item Group", "app"),
	("Workspace Sidebar", "app"),
	("Website Theme Ignore App", "app"),
	("User Invitation", "app_name"),
]
# Fields that hold a dotted Python path
METHOD_FIELDS = [("Patch Log", "patch"), ("Number Card", "method"), ("Notification", "method")]


def execute():
	installed = json.loads(frappe.db.get_global("installed_apps") or "[]")
	old_modules = [m for m in MODULES if frappe.db.exists("Module Def", m)]
	if not set(APPS) & set(installed) and not old_modules:
		return

	_installed_apps(installed)
	for old in old_modules:
		_module(old, *MODULES[old])
	frappe.db.sql(
		"update `tabCustom Field` set module=%s where name in %s", ("Mith Field Sales", FIELD_SALES_CUSTOM_FIELDS)
	)

	module_app = {new: app for new, app in MODULES.values()}
	for doctype, field in APP_FIELDS:
		if not _has(doctype, field):
			continue
		if _has(doctype, "module"):
			for module, app in module_app.items():
				frappe.db.sql(
					f"update `tab{doctype}` set `{field}`=%s where `{field}` in %s and module=%s",
					(app, tuple(APPS), module),
				)
		if doctype == "Desktop Icon":
			# an icon that opens a sidebar or workspace belongs to the app of its module (the
			# Field Sales icon links to a sidebar named after the Field Sales workspace)
			frappe.db.sql(
				"""update `tabDesktop Icon` di
				left join `tabWorkspace Sidebar` ws on ws.name = di.link_to
				left join `tabWorkspace` w on w.name = di.link_to
				join `tabModule Def` md on md.name = coalesce(ws.module, w.module)
				set di.app = md.app_name
				where di.link_to is not null and di.app in %s""",
				(tuple(APPS),),
			)
		for old in APPS:
			frappe.db.sql(f"update `tab{doctype}` set `{field}`=%s where `{field}`=%s", (APPS[old][0], old))
	_desktop_layouts()

	for doctype, field in METHOD_FIELDS:
		if _has(doctype, field):
			for old, new in PREFIXES:
				frappe.db.sql(
					f"update `tab{doctype}` set `{field}`=concat(%s, substring(`{field}`, %s)) where `{field}` like %s",
					(new, len(old) + 1, f"{old}%"),
				)
	for old in APPS:
		frappe.db.delete("Scheduled Job Type", {"method": ("like", f"{old}.%")})

	frappe.db.commit()
	try:
		from frappe.installer import _sync_installed_apps_to_site_config

		_sync_installed_apps_to_site_config()
	except ImportError:
		pass
	frappe.clear_cache()


def _installed_apps(installed):
	apps = []
	for app in installed:
		for new in APPS.get(app, [app]):
			if new not in apps:
				apps.append(new)
	frappe.db.set_global("installed_apps", json.dumps(apps))

	for old, news in APPS.items():
		rows = frappe.get_all("Installed Application", filters={"app_name": old}, pluck="name")
		for name in rows:
			if frappe.db.exists("Installed Application", {"app_name": news[0]}):
				frappe.db.delete("Installed Application", name)
			else:
				frappe.db.set_value("Installed Application", name, "app_name", news[0])
	# rows for apps that are new to this site (mith_field_sales): Frappe rebuilds them from the list
	try:
		frappe.get_single("Installed Applications").update_versions()
	except Exception:
		frappe.log_error(title="rename_from_ding: Installed Applications not refreshed")


def _module(old, new, app):
	if frappe.db.exists("Module Def", new):
		frappe.db.delete("Module Def", old)
	else:
		frappe.db.sql(
			"update `tabModule Def` set name=%s, module_name=%s, app_name=%s where name=%s", (new, new, app, old)
		)
	links = frappe.db.sql(
		"""select parent, fieldname from `tabDocField` where fieldtype='Link' and options='Module Def'
		union select dt, fieldname from `tabCustom Field` where fieldtype='Link' and options='Module Def'"""
	)
	links = [*links, ("Workspace Sidebar", "module"), ("Block Module", "module")]
	for doctype, field in set(links):
		if frappe.db.get_value("DocType", doctype, "issingle"):
			frappe.db.sql(
				"update `tabSingles` set value=%s where doctype=%s and field=%s and value=%s",
				(new, doctype, field, old),
			)
		elif _has(doctype, field):
			frappe.db.sql(f"update `tab{doctype}` set `{field}`=%s where `{field}`=%s", (new, old))


def _desktop_layouts():
	"""Desktop Layout keeps each user's icons as JSON, with the app name in every item."""
	if not _has("Desktop Layout", "layout"):
		return
	icon_app = dict(frappe.db.sql("select name, app from `tabDesktop Icon`")) if _has("Desktop Icon", "app") else {}
	for name, raw in frappe.db.sql("select name, layout from `tabDesktop Layout`"):
		try:
			layout = json.loads(raw or "[]")
		except ValueError:
			continue
		changed = False
		for item in layout if isinstance(layout, list) else []:
			if isinstance(item, dict) and item.get("app") in APPS:
				item["app"] = icon_app.get(item.get("name")) or APPS[item["app"]][0]
				changed = True
		if changed:
			frappe.db.set_value("Desktop Layout", name, "layout", json.dumps(layout), update_modified=False)


def _has(doctype, field):
	return frappe.db.table_exists(doctype) and frappe.db.has_column(doctype, field)
