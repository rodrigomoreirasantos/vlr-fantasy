import { getEmailConfig } from "@/lib/email/config";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Único ponto do módulo que toca rede.
 *
 * **Nunca lança para o chamador**: um provedor de e-mail fora do ar não pode
 * derrubar um cadastro ou um pedido de reset que já gravaram no banco — o
 * erro vira `console.error`.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const config = getEmailConfig();

  if (config.transport === "console") {
    // Dev sem RESEND_API_KEY: o link fica clicável no terminal.
    console.log(
      `[email] Para: ${input.to}\n[email] Assunto: ${input.subject}\n${input.text}`,
    );
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `Falha ao enviar e-mail via Resend (${response.status}): ${body}`,
      );
    }
  } catch (error) {
    console.error("Falha ao enviar e-mail via Resend:", error);
  }
}
