// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { exec } from "child_process";
import { Ollama } from "langchain/llms/ollama";
import { PromptTemplate } from "langchain/prompts";

const model = "codellama:7b-code";
const ollama = new Ollama({
  model,
  temperature: 0.1,
  topP: 0.3,
});

const promptTemplate = PromptTemplate.fromTemplate(
  `<PRE>{prefix} <SUF>{suffix} <MID>`,
);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let aborted = false;
  let range: vscode.Range | null = null;
  const decorationType = vscode.window.createTextEditorDecorationType({
    color: "#808080",
  });

  setup();

  // Abort generation
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "local-code-completion.abortGeneration",
      () => {
        aborted = true;
        vscode.window.showInformationMessage("Stopped generating code.");
      },
    ),
  );

  // Cancel/deny code completion suggestion
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "local-code-completion.cancel",
      (_, edit) => {
        if (range) {
          edit.delete(range);
        }
        vscode.commands.executeCommand(
          "setContext",
          "completionAvailable",
          false,
        );
        vscode.window.showInformationMessage(
          "Generated code was denied has been deleted.",
        );
      },
    ),
  );

  // Accept code completion.
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "local-code-completion.accept",
      (editor) => {
        editor.setDecorations(decorationType, []);
        vscode.commands.executeCommand(
          "setContext",
          "completionAvailable",
          false,
        );
        vscode.window.showInformationMessage("Generated code was accepted.");

        if (range) {
          editor.selection = new vscode.Selection(range.end, range.end);
        }
      },
    ),
  );

  // Generate code
  let disposable = vscode.commands.registerCommand(
    "local-code-completion.generateCode",
    async () => {
      aborted = false;

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = editor.selection.active;
        range = new vscode.Range(position, position);

        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        const endOfDocument = lastLine.range.end;
        const prefix = editor.document.getText(
          new vscode.Range(new vscode.Position(0, 0), position),
        );
        const suffix = editor.document.getText(
          new vscode.Range(position, endOfDocument),
        );

        function onFinish() {
          // Restore the cursor to the original position
          if (editor)
            editor.selection = new vscode.Selection(position, position);
          vscode.commands.executeCommand(
            "setContext",
            "completionAvailable",
            true,
          );
        }

        vscode.window
          .withProgress(
            {
              cancellable: true,
              location: vscode.ProgressLocation.Notification,
              title: "AI Code Assistant is generating code...",
            },
            async () => {
              const prompt = await promptTemplate.format({ prefix, suffix });
              const stream = await ollama.stream(prompt);
              const chunks = [];

              for await (const chunk of stream) {
                if (aborted) {
                  break;
                }

                // remove end of sequence token and remove trailing spaces
                const strippedChunk = chunk
                  .replace("<EOT>", "")
                  .replace(/ +$/gm, "");

                chunks.push(strippedChunk);
                const text = chunks.join("");
                range = new vscode.Range(
                  position,
                  new vscode.Position(
                    position.line + lineCount(text),
                    text.length + 1,
                  ),
                );

                await editor.edit((editBuilder) => {
                  if (!range) {
                    return;
                  }

                  // Insert new tokens at the correct position of each line
                  editBuilder.insert(
                    new vscode.Position(
                      range.end.line,
                      range.isSingleLine
                        ? editor.document.lineAt(range.start.line).text.length +
                          findLine(text, range.end.line, position.line).length
                        : findLine(text, range.end.line, position.line).length,
                    ),
                    strippedChunk,
                  );
                  editor.setDecorations(decorationType, [range]);
                  editor.selection = new vscode.Selection(position, position);
                });
              }
            },
          )
          .then(
            () => {
              if (!aborted) {
                vscode.window.showInformationMessage(
                  "Code has been generated.",
                );
              }

              onFinish();
            },
            () => {
              onFinish();
            },
          );
      }
    },
  );

  context.subscriptions.push(disposable);
}

function lineCount(str: string) {
  const lines = str.split("\n");
  return lines.length - 1;
}

function findLine(text: string, endLine: number, startLine: number): string {
  const textLines = text.split("\n");
  const index = endLine - startLine;

  return textLines[index];
}

function setup() {
  // Installing Ollama automatically on MacOS might not be possible as it requires an installer. We will instead provide a link to the download page on the Ollama website.
  exec("ollama --version", (error) => {
    // Check if Ollama is installed.
    if (error) {
      console.log("Ollama is not installed.");

      // Ask user to install Ollama manually.
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
    } else {
      exec("ollama list", (error) => {
        // Check if Ollama server is running.
        if (error?.message.includes("could not connect to ollama server")) {
          console.log("Ollama server not running. Starting server...");
          exec("ollama serve", (error) => {
            if (!error) console.log("Ollama server started.");

            ensureModel(model);
          });
        } else {
          ensureModel(model);
        }
      });
    }
  });
}

// check if model is installed and install if it is not.
function ensureModel(model: string) {
  exec(`ollama list`, (error, stdout) => {
    if (error) throw error;

    if (!stdout.includes(model)) {
      vscode.window.withProgress(
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
      );

      vscode.window.showInformationMessage(
        "Language model has been installed. Please reload window to enable it.",
      );
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
