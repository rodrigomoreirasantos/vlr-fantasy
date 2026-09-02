import type { Crest } from "@/lib/crest/types";

/** Um amigo aceito, já com o time (nome + brasão) resolvido. */
export type Friend = {
  friendshipId: string;
  userId: string;
  userName: string;
  username: string | null;
  teamName: string;
  crest: Crest;
};

/** Pedido de amizade recebido pelo usuário, ainda sem resposta. */
export type IncomingFriendRequest = {
  friendshipId: string;
  requesterUserId: string;
  requesterUserName: string;
  requesterUsername: string | null;
  requestedAt: Date;
};
