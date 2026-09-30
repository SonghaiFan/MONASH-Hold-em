import { GamePhase, type Player, type Card } from '../types';
import type { PublicPlayer, PokerContext } from '../plugins/api';
import { algorithmPlugins } from '../plugins/registry';
import { createVariableHost } from './variableHost';
import { formulaPlugin } from './variablePlugins';

export function runPokerVariables(input: {activePlayer: Player; allPlayers: Player[]; board: Card[]; phase: GamePhase; pot: number; currentHighBet: number; bigBlind: number; handHistory: string[]; reasoningHistory: string[]}) {
  const {activePlayer, allPlayers, board, phase, ...rest} = input;
  const publicPlayer = (p: Player): PublicPlayer => ({id:p.id, name:p.name, chips:p.chips, currentBet:p.currentBet, position:p.position, status:p.status, isDealer:p.isDealer, isActive:p.isActive, isHuman:p.isHuman, ...(p.stats ? {stats:p.stats} : {})});
  const visible = phase === GamePhase.FLOP ? 3 : phase === GamePhase.TURN ? 4 : phase === GamePhase.RIVER || phase === GamePhase.SHOWDOWN ? 5 : 0;
  const context: PokerContext = {...rest, street:phase, hero:{...publicPlayer(activePlayer), hand:activePlayer.hand}, players:allPlayers.map(publicPlayer), board:board.slice(0,visible)};
  return createVariableHost([...algorithmPlugins, formulaPlugin()]).run(context);
}
