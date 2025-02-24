// src/components/AuthComponents.tsx

import { Detail, Form, ActionPanel, Action, showToast, Toast } from "@raycast/api";

interface QRCodeAuthProps {
  qrDataUrl: string;
  isLoading: boolean;
}

interface PasswordAuthProps {
  passwordResolver: ((password: string) => void) | null;
}

/**
 * Component to display QR code for Telegram authentication
 */
export function QRCodeAuth({ qrDataUrl, isLoading }: QRCodeAuthProps) {
  return (
    <Detail
      isLoading={isLoading}
      markdown={`
# Telegram Authorization

Scan the QR code to log in:

${qrDataUrl ? `![QR Code](${qrDataUrl})` : 'Generating QR code...'}

1. Open Telegram on your phone
2. Go to Settings → Devices
3. Click "Connect Device"
4. Scan the QR code above
`}
    />
  );
}

/**
 * Component to handle 2FA password input
 */
export function PasswordAuth({ passwordResolver }: PasswordAuthProps) {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Submit Password"
            onSubmit={async (values) => {
              console.log("Submitting 2FA password...");
              const password = values.password.trim();
              if (!password) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Error",
                  message: "Password cannot be empty"
                });
                return;
              }
              if (passwordResolver) {
                passwordResolver(password);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Please enter your 2FA password to complete the authorization." />
      <Form.PasswordField
        id="password"
        title="2FA Password"
        placeholder="Enter your 2FA password"
        autoFocus
        onChange={(value) => {
          if (value.endsWith('\n') || value.endsWith('\r')) {
            const password = value.trim();
            if (password && passwordResolver) {
              passwordResolver(password);
            }
          }
        }}
      />
    </Form>
  );
}