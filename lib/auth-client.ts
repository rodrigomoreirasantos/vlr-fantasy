import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  // Atenção: é `requestPasswordReset`, não `forgetPassword` — o alias antigo
  // não existe no better-auth 1.7.1.
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient;
