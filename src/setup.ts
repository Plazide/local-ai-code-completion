import { exec } from "node:child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { logger } from "./logger.js";

// TODO: Use api instead of cli
const execAsync = promisify(exec);

let ollama = import("ollama").then((m) => {
  // TODO: Add config for remote Ollama
  return new m.Ollama();
});

export default async function setup(
  model: string,
): Promise<AbortController | undefined> {
  try {
    // Check if Ollama is installed.
    // Installing Ollama automatically on MacOS might not be possible as it requires an installer. We will instead provide a link to the download page on the Ollama website.
    await execAsync("ollama --version");
  } catch (error) {
    logger.error("Ollama is not installed.", error);

    // Ask user to install Ollama manually.
    await requestOllamaInstallation();
  }

  try {
    logger.info("Checking if Ollama server is running.");

    const ollamaClient = await ollama;
    await ollamaClient.tags();

    logger.info("Ollama server is running.");

    return;
  } catch (error) {
    const serverController = await startOllamaServer();
    await ensureModel(model);

    return serverController;
  }
}

// check if model is installed and install if it is not.
async function ensureModel(modelStr: string) {
  const ollamaClient = await ollama;
  const tags = await ollamaClient.tags();
  const [model, tag = "latest"] = modelStr.split(":");
  const fullModel = `${model}:${tag}`;

  if (tags.find((t) => t.name === fullModel)) {
    logger.info("Language model is already installed.");
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Installing language model. This can take a while...",
        cancellable: false,
      },
      async (progress): Promise<boolean> => {
        let lastByStatus: Record<string, number> = {},
          lastStatus = "";

        for await (const pr of ollamaClient.pull(fullModel)) {
          logger.debug("Pulling", pr);

          const percentStr = pr.total
            ? ((pr.completed / pr.total) * 100).toFixed(2)
            : "0";
          const percent = parseFloat(percentStr);
          const last = lastByStatus[pr.status] ?? (lastStatus ? 100 : 0);

          const increment = percent - last;
          progress.report({
            message: pr.status,
            increment,
          });

          lastByStatus[pr.status] = percent;
          lastStatus = pr.status;
        }

        return true;
      },
    );

    vscode.window.showInformationMessage("Language model has been installed.");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Language model has failed to install. Please open Ollama in your terminal and run \`ollama pull ${fullModel}\``,
    );
    throw error;
  }
}

async function requestOllamaInstallation() {
  const downloadText = "Install Ollama";
  const res = await vscode.window.showInformationMessage(
    "The Local AI code assistant extension requires a Ollama installation. Install Ollama and reload the vscode window.",
    downloadText,
  );

  if (res !== downloadText) return;

  const url = vscode.Uri.parse("https://ollama.ai/download");
  vscode.env.openExternal(url);
}

async function startOllamaServer() {
  const { promise, resolve, reject } = makeCompleter<AbortController>();
  logger.info("Ollama server not running. Starting server...");
  vscode.window.showInformationMessage("Starting Ollama server.");

  const controller = new AbortController();

  const proc = start();
  function onStart(c: string) {
    if (!String.prototype.includes.call(c, "Listening on")) return;

    vscode.window.showInformationMessage("Ollama server started.");

    proc.stdout?.off("data", onStart);
    proc.stderr?.off("data", onStart);
    resolve(controller);
  }

  proc.stdout?.on("data", onStart);
  proc.stderr?.on("data", onStart);
  proc.once("error", reject);

  return promise;

  function start() {
    return exec(
      "ollama serve",
      {
        signal: controller.signal,
      },
      (err, stdout, stderr) => {
        if (err) {
          logger.error("Ollama server exited prematurely", err, stderr);
          vscode.window.showErrorMessage("Failed to start Ollama server.");
        }

        if (controller.signal.aborted) {
          return;
        }

        logger.info("Retrying to start Ollama server");
        start();
      },
    );
  }
}

function makeCompleter<T = void>() {
  type PromiseThenParams = Parameters<Promise<T>["then"]>;

  let resolve!: NonNullable<PromiseThenParams[0]>,
    reject!: NonNullable<PromiseThenParams[1]>;

  const promise = new Promise<T>((r1, r2) => {
    resolve = r1;
    reject = r2;
  });

  return { promise, resolve, reject };
}
