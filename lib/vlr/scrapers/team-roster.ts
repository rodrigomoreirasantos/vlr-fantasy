import { load } from "cheerio";

import {
  parseScraped,
  scrapedTeamRosterSchema,
  type ScrapedTeamRoster,
} from "@/lib/vlr/schemas";
import { TEAM_ROSTER } from "@/lib/vlr/scrapers/selectors";
import {
  regionFromFlagClass,
  requireText,
  requireWithin,
  SelectorMissError,
  text,
  vlrIdFromHref,
  vlrImageUrl,
} from "@/lib/vlr/scrapers/parse";

/**
 * `/team/{id}/{slug}` — o elenco atual. É a **fonte canônica do nome da
 * organização**, o que finalmente torna confiável o cruzamento por igualdade
 * de texto entre `player.team` e `match.teamA`/`teamB`.
 *
 * Só jogadores entram — mas **não** por presença de tag nenhuma. A página tem
 * duas seções sob o mesmo `.wf-card`, cada uma com um rótulo
 * (`.wf-module-label`, "players"/"staff") seguido do `<div>` que lista os
 * itens; só a de "players" é lida. **Verificado ao vivo**: a tag
 * `.team-roster-item-name-role` que marca o cargo do staff ("head coach",
 * "manager") é a **mesma classe** que o vlr usa para o status de um jogador
 * dentro da própria seção de players (ex. "loan" — emprestado a outro time).
 * Filtrar por essa tag excluía jogador emprestado como se fosse staff; a
 * posição na seção certa é o único sinal confiável.
 */
export function parseTeamRoster(
  html: string,
  vlrId: string,
  context = `team ${vlrId}`,
): ScrapedTeamRoster {
  const $ = load(html);
  const root = $.root();

  const tag = text($(TEAM_ROSTER.headerTag).first());

  const playersLabel = $(TEAM_ROSTER.moduleLabel)
    .filter((_, el) => text($(el)).toLowerCase() === "players")
    .first();
  if (playersLabel.length === 0) {
    throw new SelectorMissError(TEAM_ROSTER.moduleLabel, context);
  }
  const items = requireWithin(playersLabel.next(), TEAM_ROSTER.item, context);
  const players: ScrapedTeamRoster["players"] = [];

  items.each((_, node) => {
    const item = $(node);

    const playerVlrId = vlrIdFromHref(
      item.find(TEAM_ROSTER.link).first().attr("href"),
      "player",
    );
    if (!playerVlrId) return;

    // O nickname divide o `.team-roster-item-name-alias` com a bandeira e com
    // a estrela de capitão; `text()` de um clone sem os ícones é só o nome.
    const aliasClone = item.find(TEAM_ROSTER.alias).first().clone();
    aliasClone.find("i").remove();
    const realName = text(item.find(TEAM_ROSTER.realName).first());

    players.push({
      vlrId: playerVlrId,
      nickname: text(aliasClone),
      realName: realName.length > 0 ? realName : null,
      country: regionFromFlagClass(
        item.find(TEAM_ROSTER.flag).first().attr("class"),
      ),
      // Nunca `requireWithin`: a ausência do bloco de foto não pode derrubar
      // o elenco inteiro — vira `null`, o mesmo que "sem foto".
      photoUrl: vlrImageUrl(item.find(TEAM_ROSTER.img).first().attr("src")),
    });
  });

  return parseScraped(
    scrapedTeamRosterSchema,
    {
      vlrId,
      name: requireText(root, TEAM_ROSTER.headerName, context),
      tag: tag.length > 0 ? tag : null,
      region: regionFromFlagClass(
        $(TEAM_ROSTER.headerCountryFlag).first().attr("class"),
      ),
      players,
    },
    context,
  );
}
