/**
 * Templates de e-mail transacional. Funções **puras** — nenhuma toca rede
 * (quem manda é `lib/email/send.ts`).
 *
 * O HTML abaixo usa cores literais (#0b0d0f, #ff4655, ...), não as variáveis
 * de tema de `app/globals.css`: cliente de e-mail não lê custom property
 * CSS. Esta é a única exceção do projeto à regra "nunca cor hard-coded" —
 * aqui ela é necessária, não um descuido.
 */

export type EmailContent = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseTemplate(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaUrl } = opts;
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:24px 32px;"><a href="${ctaUrl}" style="display:inline-block;background-color:#ff4655;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;">${escapeHtml(ctaLabel)}</a></td></tr>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#0b0d0f;color:#f2f3f4;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0d0f;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#16181c;border-radius:8px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:32px 32px 8px;">
                <span style="color:#ff4655;font-size:20px;font-weight:bold;">VLR</span><span style="color:#f2f3f4;font-size:20px;font-weight:bold;">FANTASY</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <h1 style="margin:0 0 16px;color:#f2f3f4;font-size:20px;">${escapeHtml(heading)}</h1>
                <div style="color:#c7cad0;font-size:14px;line-height:1.6;">${bodyHtml}</div>
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="color:#8b92a0;font-size:12px;margin:0;">Se você não pediu isso, ignore este e-mail.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmail(params: {
  name: string;
  url: string;
}): EmailContent {
  const name = params.name || "jogador";
  const subject = "Confirme seu e-mail e entre em campo";
  const bodyHtml = `<p>Olá, ${escapeHtml(name)}!</p><p>Falta um passo para você montar seu time: confirme seu e-mail clicando no botão abaixo.</p><p>O link expira em 1 hora.</p>`;
  const html = baseTemplate({
    preheader: subject,
    heading: subject,
    bodyHtml,
    ctaLabel: "Confirmar e-mail",
    ctaUrl: params.url,
  });
  const text = `Olá, ${name}!\n\nConfirme seu e-mail para entrar em campo: ${params.url}\n\nO link expira em 1 hora.\n\nSe você não pediu isso, ignore este e-mail.`;
  return { subject, html, text };
}

export function resetPasswordEmail(params: {
  name: string;
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  const name = params.name || "jogador";
  const subject = "Redefinir sua senha";
  const bodyHtml = `<p>Olá, ${escapeHtml(name)}!</p><p>Recebemos um pedido para redefinir sua senha. Clique no botão abaixo para escolher uma nova.</p><p>O link expira em ${params.expiresInMinutes} minutos e só pode ser usado uma vez.</p>`;
  const html = baseTemplate({
    preheader: subject,
    heading: subject,
    bodyHtml,
    ctaLabel: "Redefinir senha",
    ctaUrl: params.url,
  });
  const text = `Olá, ${name}!\n\nRedefina sua senha: ${params.url}\n\nO link expira em ${params.expiresInMinutes} minutos e só pode ser usado uma vez.\n\nSe você não pediu isso, ignore este e-mail.`;
  return { subject, html, text };
}

export function passwordChangedEmail(params: { name: string }): EmailContent {
  const name = params.name || "jogador";
  const subject = "Sua senha foi alterada";
  const bodyHtml = `<p>Olá, ${escapeHtml(name)}!</p><p>Sua senha foi alterada com sucesso. Por segurança, você foi desconectado de todos os outros aparelhos.</p><p>Se não foi você, entre em contato com o suporte imediatamente.</p>`;
  const html = baseTemplate({ preheader: subject, heading: subject, bodyHtml });
  const text = `Olá, ${name}!\n\nSua senha foi alterada com sucesso. Por segurança, você foi desconectado de todos os outros aparelhos.\n\nSe não foi você, entre em contato com o suporte imediatamente.`;
  return { subject, html, text };
}

export function existingAccountEmail(params: { name: string }): EmailContent {
  const name = params.name || "jogador";
  const subject = "Alguém tentou criar uma conta com seu e-mail";
  const bodyHtml = `<p>Olá, ${escapeHtml(name)}!</p><p>Alguém tentou criar uma conta usando este e-mail, mas você já tem uma conta na VLR Fantasy.</p><p>Se foi você, é só entrar normalmente. Esqueceu a senha? Use a recuperação de senha na tela de entrar.</p>`;
  const html = baseTemplate({ preheader: subject, heading: subject, bodyHtml });
  const text = `Olá, ${name}!\n\nAlguém tentou criar uma conta usando este e-mail, mas você já tem uma conta na VLR Fantasy.\n\nSe foi você, é só entrar normalmente. Esqueceu a senha? Use a recuperação de senha na tela de entrar.`;
  return { subject, html, text };
}
