import { window } from "vscode";

export const logger = window.createOutputChannel("Local AI Completion", {
  log: true,
});
