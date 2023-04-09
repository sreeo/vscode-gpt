import * as vscode from "vscode";
import { Configuration, OpenAIApi } from "openai";
import { APIClient, OpenAIConfig } from "./interfaces";
import { ResponseType } from "axios";


class Semaphore {
  private _available: number;
  private _queue: (() => void)[];

  constructor(concurrency: number) {
    this._available = concurrency;
    this._queue = [];
  }

  async acquire(): Promise<void> {
    if (this._available > 0) {
      this._available -= 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      if (next) {
        next();
      }
    } else {
      this._available += 1;
    }
  }
}

const appendSemaphore = new Semaphore(1);

let MODEL = "gpt-3.5-turbo";

async function getOpenAIConfig(): Promise<OpenAIConfig> {
  const config = vscode.workspace.getConfiguration("refactorWithAI");
  MODEL = config.get<string>("MODEL") || MODEL;

  let apiKey = config.get<string>("apiKey");
  let organizationId = config.get<string>("organizationId");

  if (!(apiKey && organizationId)) {
    apiKey = await vscode.window.showInputBox({
      prompt: "Please enter your OpenAI API key:",
      ignoreFocusOut: true,
    });
    organizationId = await vscode.window.showInputBox({
      prompt: "Please enter your OpenAI Organization ID:",
      ignoreFocusOut: true,
    });

    if (!apiKey || !organizationId) {
      vscode.window.showErrorMessage(
        "API key and Organization ID is required to use the Refactor with AI extension."
      );
      throw new Error("Invalid OpenAI configuration");
    }

    await config.update("apiKey", apiKey, vscode.ConfigurationTarget.Global);
    await config.update(
      "organizationId",
      organizationId,
      vscode.ConfigurationTarget.Global
    );
  }
  return { apiKey, organizationId };
}

async function getChatResponse(
  model: string,
  prompt: string,
  client: APIClient<NodeJS.ReadableStream>
) {
  const response = await client.createChatCompletion(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    },
    { responseType: "stream" }
  );
  return response;
}

async function replaceSelectionWithSuggestion(
  document: vscode.TextDocument,
  range: vscode.Range,
  suggestion: string
) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, suggestion);
  await vscode.workspace.applyEdit(edit);
}

async function appendTextToEditor(
  document: vscode.TextDocument,
  position: vscode.Position,
  text: string
): Promise<vscode.Position> {

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, position, text);
  await vscode.workspace.applyEdit(edit);

  return document.positionAt(document.offsetAt(position) + text.length);

}

export async function refactorWithAISuggestion<T>(
  document: vscode.TextDocument,
  range: vscode.Range,
  openai: any
): Promise<void> {
  try {
    const selectedText = document.getText(range);

    const prompt = `Please refactor the following code snippet, ensuring best practices and maintainability. Additionally, provide comments explaining the reasons for your changes:
    
    ${selectedText}
    `;

    const response = await getChatResponse(MODEL, prompt, openai);
    let currentPosition = range.end;
    let firstResponse = true;

    response.data.on("data", async (data: { toString: () => string }) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((line: string) => line.trim() !== "");
      for (const line of lines) {
        const message = line.replace(/^data: /, "");
        if (message === "[DONE]") {
          return; // Stream finished
        }
        try {
          const parsed = JSON.parse(message);

          if (parsed.choices[0].delta.content !== undefined) {
            let newText = parsed.choices[0].delta.content;

            // If this is the first response, append a newline before the text
            if (firstResponse) {
              await appendTextToEditor(document, currentPosition, "\n");
              currentPosition = new vscode.Position(
                currentPosition.line + 1,
                0
              );
              firstResponse = false;
            }
            currentPosition = await appendTextToEditor(document, currentPosition, newText);
          }
        } catch (error) {
          console.error("Could not JSON parse stream message", message, error);
        }
      }
    });
  } catch (error) {
    console.log(error);
  }
}

export async function generateWithAI<T>(
  document: vscode.TextDocument,
  range: vscode.Range,
  openai: any
): Promise<void> {
  try {
    const selectedText = document.getText(range);
    const prompt = `${selectedText}`;

    const response = await getChatResponse(MODEL, prompt, openai);
    let currentPosition = range.end;
    let firstResponse = true;

    response.data.on("data", async (data: { toString: () => string }) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((line: string) => line.trim() !== "");

        let newText = '';

        for (const line of lines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') {
              return; // Stream finished
          }
          try {
              const parsed = JSON.parse(message);
      
              if (parsed.choices[0].delta.content !== undefined) {
                newText += parsed.choices[0].delta.content;
              }
          } catch(error) {
              console.error('Could not JSON parse stream message', message, error);
          }
        }
      
        if (newText) {
          // If this is the first response, append a newline before the text
          if (firstResponse) {
            newText = '\n' + newText;
            firstResponse = false;
          }
      
          currentPosition = await appendTextToEditor(document, currentPosition, newText);
        }
    });
  } catch (error) {
    console.log(error);
  }
}

async function getEditor(): Promise<vscode.TextEditor | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active text editor found");
    return null;
  }
  return editor;
}

async function registerCommands(context: vscode.ExtensionContext, openai: any) {
  const refactorWithAISuggestionCommand = vscode.commands.registerCommand(
    "extension.refactorWithAISuggestion",
    async () => {
      const editor = await getEditor();
      if (!editor) return;
      const selectedRange = editor.selection;
      await refactorWithAISuggestion(editor.document, selectedRange, openai);
    }
  );

  const generateWithAICommand = vscode.commands.registerCommand(
    "extension.generateWithAI",
    async () => {
      const editor = await getEditor();
      if (!editor) return;
      const selectedRange = editor.selection;
      await generateWithAI(editor.document, selectedRange, openai);
    }
  );

  context.subscriptions.push(refactorWithAISuggestionCommand, generateWithAICommand);
}

export async function activate(context: vscode.ExtensionContext) {
  const openAIConfig = await getOpenAIConfig();
  const configuration = new Configuration(openAIConfig);
  const openai = new OpenAIApi(configuration);
  await registerCommands(context, openai);
}

export function deactivate() {}
