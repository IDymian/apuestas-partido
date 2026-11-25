import { formatSoles, SettlementResult } from './settlement';

export interface SummaryContext {
  title: string;
  playerName: (id: string | null) => string;
  marketName: (id: string) => string;
  paidKeys: Set<string>;
}

/** Resumen de la liquidación en texto para pegar en WhatsApp (*negrita* incluida). */
export function whatsappSummary(r: SettlementResult, ctx: SummaryContext): string {
  const lines: string[] = [`⚽ *${ctx.title}*`, '*Resultados de la polla*', ''];

  for (const m of r.markets) {
    const head = `*${m.name}* · bote ${formatSoles(m.totalPotCents)}`;
    switch (m.outcome) {
      case 'winners':
        lines.push(`${head}\nGanó ${ctx.playerName(m.winnerPlayerId)}`);
        for (const p of m.payouts) lines.push(`  • ${p.bettorName}: ${formatSoles(p.amountCents)}`);
        break;
      case 'no_winner':
        lines.push(
          `${head}\nGanó ${ctx.playerName(m.winnerPlayerId)}, nadie le apostó → ` +
            (m.rolledToMarketId ? `pasa a ${ctx.marketName(m.rolledToMarketId)}` : 'queda acumulado'),
        );
        break;
      case 'refund':
        lines.push(`${head}\n${m.reason}: se devuelve lo apostado`);
        break;
      default:
        lines.push(`${head}\nSin resolver`);
    }
    lines.push('');
  }

  const cobran = r.people.filter((p) => p.totalCents > 0);
  if (cobran.length) {
    lines.push('💰 *A cobrar*');
    for (const p of cobran) {
      lines.push(`• ${p.bettorName}: ${formatSoles(p.totalCents)}${ctx.paidKeys.has(p.personKey) ? ' ✅' : ''}`);
    }
  } else {
    lines.push('Nadie cobra en este partido.');
  }
  if (r.accumulatedCents > 0) {
    lines.push('', `🏦 Acumulado para el próximo partido: ${formatSoles(r.accumulatedCents)}`);
  }
  return lines.join('\n');
}
