import * as vscode from "vscode";
import { Configuration, OpenAIApi } from "openai";
import { APIClient, OpenAIConfig } from "./interfaces";

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
  client: APIClient
) {
  const response = await client.createChatCompletion({
    model,
    messages: [{ role: "user", content: prompt }],
  });
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

export async function refactorWithAISuggestion(
  document: vscode.TextDocument,
  range: vscode.Range,
  openai: APIClient
): Promise<void> {
  try {
    const selectedText = document.getText(range);

    const prompt = `Suggest refactoring for the following code:\n\n${selectedText}\n\n. Assume the output returned is being replaced with the selected code passed in the prompt. Also the reasons should be commented out in the code.`;

    const response = await getChatResponse(MODEL, prompt, openai);

    if (response.data?.choices.length > 0) {
      const suggestion = response.data?.choices[0].message?.content || "";
      await replaceSelectionWithSuggestion(document, range, suggestion);
    }
  } catch (error) {
    console.log(error);
  }
}

export async function generateWithAI(
  document: vscode.TextDocument,
  range: vscode.Range,
  openai: APIClient
): Promise<void> {
  try {
    const selectedText = document.getText(range);
    const prompt = `${selectedText}`;
    const response = await getChatResponse(MODEL, prompt, openai);

    if (response.data?.choices.length > 0) {
      const suggestion = response.data?.choices[0].message?.content || "";
      const refactoredCode = `${prompt}\n${suggestion}`;
      await replaceSelectionWithSuggestion(document, range, refactoredCode);
    }
  } catch (error) {
    console.log(error);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const openAIConfig = await getOpenAIConfig();
  const configuration = new Configuration(openAIConfig);
  const openai = new OpenAIApi(configuration);

  const refactorWithAISuggestionCommand = vscode.commands.registerCommand(
    "extension.refactorWithAISuggestion",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selectedRange = editor.selection;

      await refactorWithAISuggestion(editor.document, selectedRange, openai);
    }
  );

  const generateWithAICommand = vscode.commands.registerCommand(
    "extension.generateWithAI",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selectedRange = editor.selection;

      await generateWithAI(editor.document, selectedRange, openai);
    }
  );

  context.subscriptions.push(
    refactorWithAISuggestionCommand,
    generateWithAICommand
  );
}

export function deactivate() {}
