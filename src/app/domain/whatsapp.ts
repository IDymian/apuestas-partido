import { formatSoles, MarketResult, SettlementResult } from './settlement';

export interface SummaryContext {
  title: string;
  /** Nombre legible de lo que ganó: jugador, equipo o "racha de 4". */
  selectionLabel: (market: MarketResult, selection: string | null) => string;
  marketName: (id: string) => string;
  paidKeys: Set<string>;
}

/** Resumen de la liquidación en texto para pegar en WhatsApp (*negrita* incluida). */
export function whatsappSummary(r: SettlementResult, ctx: SummaryContext): string {
  const lines: string[] = [`⚽ *${ctx.title}*`, '*Resultados de las apuestas*', ''];

  for (const m of r.markets) {
    const head = `*${m.name}* · bote ${formatSoles(m.totalPotCents)}`;
    const won = ctx.selectionLabel(m, m.winnerSelection);
    switch (m.outcome) {
      case 'winners':
        lines.push(`${head}\nGanó: ${won}`);
        for (const p of m.payouts) lines.push(`  • ${p.bettorName}: ${formatSoles(p.amountCents)}`);
        break;
      case 'no_winner':
        lines.push(
          `${head}\nGanó: ${won}, nadie le apostó → ` +
            (m.rolledToMarketId ? `pasa a ${ctx.marketName(m.rolledToMarketId)}` : 'se lo queda el organizador'),
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
    lines.push('Nadie cobra en esta jornada.');
  }
  if (r.houseCents > 0) {
    lines.push('', `🏦 Para el organizador (nadie acertó): ${formatSoles(r.houseCents)}`);
  }
  return lines.join('\n');
}
