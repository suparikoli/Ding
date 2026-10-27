# Mith Calling

> Renamed from `ding` on 2026-10-24 (owner-approved `mith_` names), with the `smartflo` app merged in as its
> Smartflo module. ding's field sales moved to `mith_field_sales`. A site that still runs ding or smartflo:
> put both new apps on the bench, then `bench --site <site> rename-from-ding` (or `rename-from-smartflo`, the
> same patch), then `bench --site <site> migrate`.

Calling from the Lead, Customer and Contact forms of a Frappe / ERPNext site.

- **Call and WhatsApp buttons** (group *Ding*): `tel:` calls on mobile and phone, `wa.me/` links, a call-log
  entry per call (**Ding Call Logs**), and the record's call history.
- **WhatsApp templates** from **Ding Settings** (`/app/ding-settings`): company profile, website, eCommerce and
  price-list links, each button shown only when its URL is set.
- **Smartflo** (Tata Tele Business): click-to-call through a dialer queue, WebRTC / PSTN dialer and phone panel,
  inbound calls and webhooks, call records (CDR) sync, agent mapping, and the Smartflo Call Report. Configure in
  **Smartflo Settings** (`api_token`, `webhook_secret`, account, caller ID, dialplan). The webhook URL Smartflo
  already has (`/api/method/smartflo.tatatelebiz_smartflo_integration.api.webhook.handle_event`) keeps working;
  the new path is `mith_calling.smartflo.api.webhook.handle_event`.

Doctype names are unchanged from ding and smartflo, so no data moves when a site is renamed.

```bash
bench --site <site> install-app mith_calling
bench --site <site> run-tests --app mith_calling
```

#### License

mit
