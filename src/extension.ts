import * as vscode from "vscode";
import { Configuration, OpenAIApi } from "openai";

export function activate(context: vscode.ExtensionContext) {
  const refactorWithAISuggestionCommand = vscode.commands.registerCommand(
    "extension.refactorWithAISuggestion",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const selectedRange = editor.selection;

      await refactorWithAISuggestion(editor.document, selectedRange);
    }
  );

  context.subscriptions.push(refactorWithAISuggestionCommand);
}

export function deactivate() {}

export async function refactorWithAISuggestion(
  document: vscode.TextDocument,
  range: vscode.Range
): Promise<void> {
  try {
    // Get the selected text from the document using the range
    const selectedText = document.getText(range);
    const prompt = `Suggest refactoring for following code:\n\n${selectedText}\n\n. 
      Also the reasons should be commented out in the code.`;

    // ... Rest of the OpenAI API call and response handling
    const config = vscode.workspace.getConfiguration("refactorWithAI");
    let apiKey = config.get<string>("apiKey");
    let organizationId = config.get<string>("organizationId");

    if (!apiKey || !organizationId) {
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
        return;
      }

      // Save the API key to the user's settings
      await config.update("apiKey", apiKey, vscode.ConfigurationTarget.Global);
      await config.update(
        "organizationId",
        organizationId,
        vscode.ConfigurationTarget.Global
      );
    }

    const configuration = new Configuration({
      organization: organizationId,
      apiKey: apiKey,
    });

    const openai = new OpenAIApi(configuration);
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });
    let refactorSuggestion = "";

    if (response.data?.choices.length > 0) {
      const suggestions = response.data?.choices;
      refactorSuggestion = suggestions[0].message?.content || "";

      // Apply the refactoring suggestion to the selected range
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, refactorSuggestion);
      await vscode.workspace.applyEdit(edit);
    }
  } catch (error) {
    console.log(error);
  }
}
