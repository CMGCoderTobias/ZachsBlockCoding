# ZachsBlockCoding Connector

This optional connector leaves the block engine in the standalone app. VS Code owns connected JavaScript/JSX buffers, unsaved text, saving and its existing language tools.

1. Install the local VSIX using VS Code's **Extensions: Install from VSIX** command.
2. Start the standalone app and click **Connect VS Code**. This copies a temporary pairing code.
3. In a trusted, local VS Code window, run **ZachsBlockCoding: Connect to Standalone App** and paste the code.
4. Select a JavaScript file. Its unsaved text appears in an app tab. Choose **Blocks only** in the app to hide the code preview and inspector.
5. Edit blocks. Version-checked edits update the VS Code buffer and participate in its undo history. **Save** in the app asks VS Code to save.

Changing active JavaScript editors shares those files too. Other open documents are not scanned. The current limit is 20 shared files of up to 1 MB each. Remote SSH, WSL, Codespaces, and Visual Studio are not supported by this connector yet. Standalone saved-file editing still works without it.

If concurrent edits conflict, the app keeps its local draft and offers **Reload from VS Code** or **Save As**. It does not guess a merge. Disconnecting does not close or discard VS Code documents. Connected code preview is read-only: type in VS Code, or disconnect for standalone typing.

The bridge binds only to `127.0.0.1`, uses a random session credential, limits frame sizes, and accepts only documents shared by the connector. Pairing expires after ten minutes if unused. No cloud service, telemetry, persisted credential, automatic extension installation, or code execution is involved. Keep the pairing code private.

Development: launch VS Code with `--extensionDevelopmentPath` pointing at this folder. The extension uses only Node built-ins and the stable VS Code API; no npm install is needed here.

API reference: https://code.visualstudio.com/api/references/vscode-api
# Connector 0.2.0

Pair once in a trusted local VS Code workspace. The pairing is saved in VS Code
SecretStorage and the desktop app's encrypted local store, then retried when the
app reopens. Open both apps; no always-running daemon is installed. One editor
window connects at a time. Disconnect pauses this session; use **Forget Pairing**
in both apps to remove saved trust. The new handshake verifies both endpoints
before sharing buffers; update the standalone app and connector together.

