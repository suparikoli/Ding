import click
import frappe
from frappe.commands import pass_context


def _rename(context):
	from mith_calling.patches.rename_from_ding import execute

	for site in context.sites:
		frappe.init(site=site)
		frappe.connect()
		try:
			execute()
			click.echo(f"{site}: now on mith_calling (+ mith_field_sales if it ran ding); run `bench --site {site} migrate`")
		finally:
			frappe.destroy()


@click.command("rename-from-ding")
@pass_context
def rename_from_ding_cmd(context):
	"""Move this site from ding (and smartflo) to mith_calling + mith_field_sales. Run once, before migrate."""
	_rename(context)


@click.command("rename-from-smartflo")
@pass_context
def rename_from_smartflo_cmd(context):
	"""Move this site from smartflo (and ding) to mith_calling. Run once, before migrate."""
	_rename(context)


commands = [rename_from_ding_cmd, rename_from_smartflo_cmd]
