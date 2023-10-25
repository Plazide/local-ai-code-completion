import { ExecException, exec } from "child_process";
import * as vscode from "vscode";

export default async function setup(model: string) {
  return new Promise((resolve, reject) => {
    // Installing Ollama automatically on MacOS might not be possible as it requires an installer. We will instead provide a link to the download page on the Ollama website.
    exec("ollama --version", (error) => {
      // Check if Ollama is installed.
      if (error) {
        console.log("Ollama is not installed.");

        // Ask user to install Ollama manually.
        requestOllamaInstallation();
      } else {
        // Check if Ollama server is running.
        exec("ollama list", async (error) => {
          console.log(
            "Running 'ollama list' to check if ollama server is running.",
          );

          const serverStarted = await startOllamaServer(error);
          if (serverStarted) {
            const modelInstalled = await ensureModel(model);
            resolve(modelInstalled);
          } else {
            resolve(false);
          }
        });
      }
    });
  });
}

// check if model is installed and install if it is not.
async function ensureModel(model: string) {
  return new Promise((resolve, reject) => {
    exec(`ollama list`, (error, stdout) => {
      if (error) throw error;

      if (!stdout.includes(model)) {
        vscode.window
          .withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Installing language model. This can take a while...",
              cancellable: false,
            },
            async (progress) => {
              return new Promise((resolve, reject) => {
                const proc = exec(`ollama pull ${model}`);

                proc.stdout?.addListener("data", (data) => {
                  console.log(`stdout: ${data}`);
                });

                proc.stderr?.addListener("data", (chunk) => {
                  const regex = /(\d+)%/gim;
                  const match = chunk.match(regex);

                  if (match) {
                    const percent = match[0].replace("%", "");

                    progress.report({
                      message: "Installing...",
                      increment: parseInt(percent),
                    });
                  }
                });

                proc.on("close", (code) => {
                  if (code !== 0) {
                    reject(
                      new Error(`ollama pull process exited with code ${code}`),
                    );
                  } else {
                    resolve("");
                  }
                });
              });
            },
          )
          .then(
            () => {
              vscode.window.showInformationMessage(
                "Language model has been installed. Please reload window to enable it.",
              );

              resolve(true);
            },
            () => {
              vscode.window.showErrorMessage(
                `Language model has failed to install. Please open Ollama in your terminal and run \`ollama pull ${model}\``,
              );

              resolve(false);
            },
          );
      } else {
        console.log("Language model is already installed.");
        resolve(true);
      }
    });
  });
}

function requestOllamaInstallation() {
  vscode.window
    .showInformationMessage(
      "The Local AI code assistant extension requires a Ollama installation. Install Ollama and reload the vscode window.",
      "Install Ollama",
    )
    .then((value) => {
      if (value === "Install Ollama") {
        const url = vscode.Uri.parse("https://ollama.ai/download");
        vscode.env.openExternal(url);
      }
    });
}

function startOllamaServer(error: ExecException | null) {
  return new Promise((resolve) => {
    if (error?.message.includes("could not connect to ollama server")) {
      vscode.window.showInformationMessage("Starting Ollama server.");

      console.log("Ollama server not running. Starting server...");
      exec("ollama serve");

      // Use timeout to wait for server to start. Possibly replace this with a while loop.
      setTimeout(() => {
        exec("ollama list", async (error) => {
          if (!error) {
            console.log("Ollama server started.");
            vscode.window.showInformationMessage("Ollama server started.");
            // const modelInstalled = await ensureModel(model);
            resolve(true);
          } else {
            console.error(error);
            vscode.window.showErrorMessage("Failed to start Ollama server.");
            resolve(false);
          }
        });
      }, 2000);
    } else {
      // const modelInstalled = await ensureModel(model);
      resolve(true);
    }
  });
}
