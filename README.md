# paseo-zcode-patcher

Creates a local macOS arm64 app copy of Paseo 0.7.2 with a built-in provider for ZCode 3.11.2.

> [!NOTE]
> This project is an unofficial tool and is not officially released, endorsed, or maintained by ZCode or Z.ai.

> [!WARNING]
> paseo-zcode-patcher uses ZCode's undocumented headless mode. It does not modify the ZCode application itself or include any implementation that bypasses its communications. However, there is no guarantee that it will not be interpreted as violating the [Terms of Service](https://zcode.z.ai/en/terms). Therefore, please use it at your own risk.

## Supported environment

- macOS arm64 (Other OS support is under development)
- Node.js 22.12.0 or later
- Official Paseo 0.7.2 at `/Applications/Paseo.app` (the supported ASAR is strictly verified by its SHA-256 hash)
- Official ZCode 3.11.2 / CLI 0.16.5 at `/Applications/ZCode.app`

Other versions, alternative installation paths, and modified ZCode hosts are rejected. There is no fallback that assumes compatibility.

## Usage

Quit Paseo, ZCode, and any processes that use the ZCode host before running:

```console
npm ci --ignore-scripts
npm run build
node dist/src/cli.js patch
```

On success, the patcher creates `/Applications/PaseoZCode.app`. The original `/Applications/Paseo.app` and `/Applications/ZCode.app` remain unchanged. If an output app already exists, it is replaced only after all preflight checks pass.

For the pinned versions, testing on a physical machine has verified the generated ASAR and renderer resource hashes, strict code signature validation, three independent cold starts, all four ZCode models, the existing `PlanCard`, and the same Z.ai icon used by GLM Agent. See [Implementation status](docs/implementation-status.md) for the results.

Mode synchronization after Plan approval and preservation of the mode selected immediately before Plan in the new-session form have been fixed and applied to `/Applications/PaseoZCode.app`. Testing on a physical machine confirmed a return to `build`, `edit`, and `yolo`. UI testing also confirmed that selecting `Full access → Plan` before the first submission returns to `Full access` after approval and completes implementation in the same turn. Opening a separate new-session form directly in Plan returns to `Ask before changes`, without inheriting the previous form's return mode.

## Development and verification

In ZCode sessions, the circular icon to the left of the microphone shows context usage and personal subscription quotas for the active connection. It uses current values from the official host and stays in sync through compaction, model changes, and session resumption. The existing card displays the connection name, plan, usage percentage, remaining quota, and reset time, with explicit messages for unsupported features or retrieval failures. Team Plan is outside the supported scope. The values have been cross-checked between the generated app and the official ZCode UI. Remaining additional resets and expiration times in the device's local time with a UTC offset (for example, `2026-10-02 00:59 +09:00`) are also implemented, along with quota ordering of five-hour, weekly, then monthly tool usage. See Implementation status for whether these changes have been applied to the app.

```console
npm test
npm run typecheck
npm run build
npm run format:check
npm audit
```

To regenerate the overlay from a clean checkout of the pinned Paseo source commit:

```console
npm run build:overlay -- --paseo-source /path/to/paseo-at-9400a49af670fdb5db4af58e73f8df98588dbea9
```

See [docs/README.md](docs/README.md) for detailed specifications, security boundaries, and checks to run on a physical machine.

## Data and credentials

The provider uses the official host service from the installed ZCode app. ZCode owns its login state, credentials, and model provider settings; this patcher does not create, update, or copy them. Prompts, workspace information, and model communications are subject to ZCode's terms of use and privacy policy. Paseo's history storage and logs are managed separately.

## Distribution

The Paseo and ZCode applications are not bundled. This package remains `private` because the distribution licenses of the referenced private projects have not been explicitly specified. Before public distribution, review the conditions in [NOTICE](NOTICE) and [docs/security-and-licensing.md](docs/security-and-licensing.md).
