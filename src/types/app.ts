export type CommanderCard = { scryfallId: string; name: string; imageUrl?: string; colorIdentity?: string[]; typeLine?: string; oracleText?: string };
export type ParticipantInput = { seat: number; playerName: string; primary: CommanderCard | null; secondary?: CommanderCard | null; isWinner?: boolean };
export type GameRecord = { id: string; playedAt: string; durationMinutes?: number | null; playersCount: number; winCondition: string; notes?: string; participants: ParticipantInput[] };
