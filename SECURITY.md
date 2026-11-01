# Security

SunArc runs inside your own home and can switch lights, scenes, blinds and (by hand, with an end time) climate devices through Home Assistant. A security problem therefore matters, and I would like to hear about it before it is public.

## Reporting a vulnerability

Please use **[Report a vulnerability](https://github.com/Ricardo-switch/SunARC-HA-APP/security/advisories/new)** on GitHub. That keeps the report private between you and the maintainer. Do not open a public issue.

Mention the version (Settings › About this app, or `/api/health`), how SunArc runs (Home Assistant add-on or Docker), and the steps to reproduce. Dutch or English are both fine.

You will get an answer within a week. A fix ships as a new add-on version; the changelog names the problem once the update is out.

## What is in scope

- The add-on and its web app, including the separate port for Tailscale (decision 160).
- The narrow write paths to Home Assistant (lights, scenes, blinds, by-hand climate). Anything that writes outside them is a bug.
- The Home Assistant integration in `custom_components/smart_climate`.

## Supported versions

Only the latest version on `main` gets fixes. Home Assistant offers the update in the add-on store.
