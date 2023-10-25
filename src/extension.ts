// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Ollama } from "langchain/llms/ollama";
import { PromptTemplate } from "langchain/prompts";
import setup from "./setup";

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
export async function activate(context: vscode.ExtensionContext) {
  let aborted = false;
  let range: vscode.Range | null = null;
  const decorationType = vscode.window.createTextEditorDecorationType({
    color: "#808080",
  });

  const success = await setup(model);
  if (!success) return;

  // Abort generation
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "local-ai-code-completion.abortGeneration",
      () => {
        aborted = true;
        vscode.window.showInformationMessage("Stopped generating code.");
      },
    ),
  );

  // Cancel/deny code completion suggestion
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "local-ai-code-completion.cancel",
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
      "local-ai-code-completion.accept",
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
    "local-ai-code-completion.generateCode",
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

          vscode.commands.executeCommand(
            "setContext",
            "generatingCompletion",
            false,
          );
        }

        vscode.window
          .withProgress(
            {
              cancellable: true,
              location: vscode.ProgressLocation.Notification,
              title: "AI Code Assistant is generating code...",
            },
            async (_, token) => {
              const prompt = await promptTemplate.format({ prefix, suffix });
              const stream = await ollama.stream(prompt);
              const chunks = [];

              token.onCancellationRequested(() => {
                aborted = true;
              });

              vscode.commands.executeCommand(
                "setContext",
                "generatingCompletion",
                true,
              );

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

// This method is called when your extension is deactivated
export function deactivate() {}
