import type { ActionDef, NobleDef } from './types.js';

/**
 * Guillotine 2028 — classic noble set remapped by branch:
 * Purple → Executive · Red → Legislative · Green → Judicial · Blue → Media · Gray → Martyr
 */
export const NOBLES: NobleDef[] = [
  // ——— Executive (classic purple) ———
  { id: 'trump', name: 'Orange Pedophile', realName: 'Donald Trump', suit: 'executive', points: 5, ability: 'none', blurb: '' },
  { id: 'melania', name: 'Melanoma', realName: 'Melania Trump', suit: 'executive', points: 5, ability: 'none', blurb: '' },
  { id: 'vance', name: 'Couchfucker', realName: 'JD Vance', suit: 'executive', points: 4, ability: 'none', blurb: '' },
  { id: 'miller', name: 'Naziferatu', realName: 'Stephen Miller', suit: 'executive', points: 3, ability: 'end_day', blurb: 'After you collect this, the day ends. Discard the rest of the line.' },
  { id: 'hegseth', name: 'Secretary of War Crimes', realName: 'Pete Hegseth', suit: 'executive', points: 3, ability: 'none', blurb: '' },
  { id: 'lutnick', name: 'Tariff Tyrant', realName: 'Howard Lutnick', suit: 'executive', points: 3, ability: 'none', blurb: '' },
  { id: 'bondi', name: 'Scientologist General', realName: 'Pam Bondi', suit: 'executive', points: 2, ability: 'draw_action', blurb: 'Draw an extra action card after you collect this.' },
  { id: 'patel', name: 'Federal Boob Director', realName: 'Kash Patel', suit: 'executive', points: 2, ability: 'draw_action', blurb: 'Draw an extra action card after you collect this.' },
  { id: 'noem', name: 'Puppykiller', realName: 'Kristi Noem', suit: 'executive', points: 2, ability: 'pair_count', blurb: 'Worth +2 more if you also have Decoy Plane.' },
  { id: 'leavitt', name: 'Decoy Plane', realName: 'Karoline Leavitt', suit: 'executive', points: 2, ability: 'pair_countess', blurb: 'Worth +2 more if you also have Puppykiller.' },
  { id: 'vivek', name: 'Grand Nagus', realName: 'Vivek Ramaswamy', suit: 'executive', points: 2, ability: 'fast_noble', blurb: 'After collecting, collect another figure from the front of the line.' },
  { id: 'rfk', name: 'Brain Worm', realName: 'RFK Jr.', suit: 'executive', points: 1, ability: 'draw_action', blurb: 'Draw an extra action card after you collect this.' },
  { id: 'tulsi', name: 'Cultist', realName: 'Tulsi Gabbard', suit: 'executive', points: 1, ability: 'none', blurb: '' },
  { id: 'harp', name: 'Human Printer', realName: 'Natalie Harp', suit: 'executive', points: 1, ability: 'none', blurb: '' },
  { id: 'bessent', name: 'Pink Boi', realName: 'Scott Bessent', suit: 'executive', points: 1, ability: 'none', blurb: '' },

  // ——— Legislative (classic red) ———
  { id: 'clerk', name: 'Overzealous Staffer', realName: 'Congressional staffer', suit: 'legislative', points: 0, ability: 'palace_guard', blurb: 'Each Overzealous Staffer is worth a number of points equal to the number of Overzealous Staffers in your pile.', copies: 5 },
  { id: 'mcconnell', name: 'The Turtle', realName: 'Mitch McConnell', suit: 'legislative', points: 4, ability: 'master_spy', blurb: 'Whenever an action card is played, this moves to the end of the line.' },
  { id: 'mike_johnson', name: 'Theocrat', realName: 'Mike Johnson', suit: 'legislative', points: 4, ability: 'add_noble_to_end', blurb: 'After collecting, add another figure from the deck to the end of the line.' },
  { id: 'mccarthy', name: 'Kneepads McGee', realName: 'Kevin McCarthy', suit: 'legislative', points: 3, ability: 'none', blurb: '' },
  { id: 'cruz', name: 'Flaccid Wolverine', realName: 'Ted Cruz', suit: 'legislative', points: 2, ability: 'add_noble_to_end', blurb: 'After collecting, add another figure from the deck to the end of the line.' },
  { id: 'pelosi', name: 'Inside Traitor', realName: 'Nancy Pelosi', suit: 'legislative', points: 2, ability: 'none', blurb: '' },
  { id: 'schumer', name: 'Israel Uber Alles', realName: 'Chuck Schumer', suit: 'legislative', points: 2, ability: 'none', blurb: '' },

  // ——— Judicial (classic green) ———
  { id: 'roberts', name: 'Tax Dodge', realName: 'John Roberts', suit: 'judicial', points: 4, ability: 'none', blurb: '' },
  { id: 'alito', name: 'Abortion Autarch', realName: 'Samuel Alito', suit: 'judicial', points: 3, ability: 'none', blurb: '' },
  { id: 'thomas', name: "'Uncle' Thomas", realName: 'Clarence Thomas', suit: 'judicial', points: 3, ability: 'none', blurb: '' },
  { id: 'barrett', name: 'Handmaid', realName: 'Amy Coney Barrett', suit: 'judicial', points: 2, ability: 'unpopular_judge', blurb: 'No one may play an action while this is at the front of the line.' },
  { id: 'gorsuch', name: 'Textualist', realName: 'Neil Gorsuch', suit: 'judicial', points: 2, ability: 'unpopular_judge', blurb: 'No one may play an action while this is at the front of the line.' },
  { id: 'kavanaugh', name: 'Beer Bro', realName: 'Brett Kavanaugh', suit: 'judicial', points: 2, ability: 'none', blurb: '' },
  { id: 'cannon', name: 'Delay Docket', realName: 'Aileen Cannon', suit: 'judicial', points: 2, ability: 'none', blurb: '' },
  { id: 'rival', name: 'Rival Executioner', realName: 'Antifa executioner', suit: 'judicial', points: 1, ability: 'rival_executioner', blurb: 'After collecting, also collect the top figure from the deck.' },
  { id: 'leaky_clerk', name: 'Leaky Clerk', realName: 'Law clerk', suit: 'judicial', points: 1, ability: 'none', blurb: '', copies: 2 },

  // ——— Media (classic blue) ———
  { id: 'murdoch', name: 'News Emperor', realName: 'Rupert Murdoch', suit: 'media', points: 5, ability: 'none', blurb: '' },
  { id: 'tucker', name: 'Nepo Handbiter', realName: 'Tucker Carlson', suit: 'media', points: 4, ability: 'none', blurb: '' },
  { id: 'alex_jones', name: 'Anal Autohuffer', realName: 'Alex Jones', suit: 'media', points: 3, ability: 'none', blurb: '' },
  { id: 'hannity', name: 'Individual #3', realName: 'Sean Hannity', suit: 'media', points: 2, ability: 'none', blurb: '' },
  { id: 'rogan', name: 'Platformer of Heels', realName: 'Joe Rogan', suit: 'media', points: 2, ability: 'none', blurb: '' },
  { id: 'fuentes', name: 'One of the Good Ones', realName: 'Nick Fuentes', suit: 'media', points: 1, ability: 'none', blurb: '' },
  { id: 'okeefe', name: 'Boat/Dildo (Attempted) Rapist', realName: "James O'Keefe", suit: 'media', points: 1, ability: 'none', blurb: '' },

  // ——— Martyr (classic gray) ———
  { id: 'luigi', name: 'The Adjuster', realName: 'Luigi Mangione', suit: 'martyr', points: -3, ability: 'none', blurb: '' },
  { id: 'kimmel', name: 'Late Night', realName: 'Jimmy Kimmel', suit: 'martyr', points: -2, ability: 'clown', blurb: 'When collected, place this into another player’s score pile.' },
  { id: 'confused', name: 'Confused Tourist', realName: 'Confused tourist', suit: 'martyr', points: -1, ability: 'innocent_victim', blurb: 'Discard an action card from your hand after you collect this.' },
  { id: 'jan6', name: 'Jan. 6er', realName: 'Jan. 6er', suit: 'martyr', points: -1, ability: 'none', blurb: '', copies: 3 },
  { id: 'sanders', name: 'Feel the Bern', realName: 'Bernie Sanders', suit: 'martyr', points: -1, ability: 'tragic_figure', blurb: 'Worth −1 for every Martyr in your pile (including this).' },
];

export function expandNobles(): NobleDef[] {
  const out: NobleDef[] = [];
  for (const n of NOBLES) {
    const copies = n.copies ?? 1;
    for (let i = 0; i < copies; i++) {
      out.push({
        ...n,
        id: copies > 1 ? `${n.id}_${i + 1}` : n.id,
        copies: 1,
      });
    }
  }
  return out;
}

/** Classic action vocabulary with 2028 names. */
export const ACTIONS: ActionDef[] = [
  { id: 'ignoble', name: 'Doxxed Figure', text: 'Move a figure forward exactly 4 places in line.', effect: { kind: 'move_forward_exact', n: 4 }, copies: 2 },
  { id: 'far_better', name: 'Think Piece', text: 'Move a figure forward exactly 3 places in line.', effect: { kind: 'move_forward_exact', n: 3 } },
  { id: 'was_name', name: 'Was That My Name?', text: 'Move a figure forward up to 3 places in line.', effect: { kind: 'move_forward', max: 3 } },
  { id: 'pushed', name: 'Pushed', text: 'Move a figure forward exactly 2 places in line.', effect: { kind: 'move_forward_exact', n: 2 }, copies: 2 },
  { id: 'idiot', name: "Ratio'd", text: 'Move a figure forward up to 2 places in line.', effect: { kind: 'move_forward', max: 2 }, copies: 2 },
  { id: 'market_might', name: 'Bench Warrant', text: 'Move a Judicial figure forward up to 2 places in line.', effect: { kind: 'move_suit_forward', suit: 'judicial', max: 2 } },
  { id: 'red_carpet', name: 'Whip Line', text: 'Move a Legislative figure forward up to 2 places in line.', effect: { kind: 'move_suit_forward', suit: 'legislative', max: 2 } },
  { id: 'polling_surge', name: 'Executive Order', text: 'Move an Executive figure forward up to 2 places in line.', effect: { kind: 'move_suit_forward', suit: 'executive', max: 2 } },
  { id: 'stumble', name: 'Stumble', text: 'Move a figure forward exactly 1 place in line.', effect: { kind: 'move_forward_exact', n: 1 }, copies: 2 },
  { id: 'fainting', name: 'Fainting Spell', text: 'Move a figure backward up to 3 places in line.', effect: { kind: 'move_back', max: 3 } },
  { id: 'friend_melania', name: 'Friend of Melania', text: 'Move a figure backward up to 2 places in line.', effect: { kind: 'move_back', max: 2 }, copies: 2 },
  { id: 'trip', name: 'Trip', text: 'Move a figure backward exactly 1 place, then you may play another action.', effect: { kind: 'move_back_exact_extra', n: 1 }, copies: 2 },
  { id: 'idrc', name: "I Really Don't Care, Do U?", text: 'Move Melanoma to the front of the line.', effect: { kind: 'move_named_to_front', nobleId: 'melania' } },
  { id: 'lack_trust', name: 'Lack of Trust', text: 'Move a Media figure to the front of the line.', effect: { kind: 'move_suit_to_front', suit: 'media' } },
  { id: 'forward_march', name: 'Forward March', text: 'Move an Overzealous Staffer to the front of the line.', effect: { kind: 'move_ability_to_front', ability: 'palace_guard' } },
  { id: 'double_feature', name: 'Double Feature', text: 'Collect an additional figure from the front of the line.', effect: { kind: 'collect_extra_front' }, copies: 2 },
  { id: 'after_you', name: 'After You…', text: 'Put the front figure into another player’s score pile.', effect: { kind: 'give_front_to_player' } },
  { id: 'public_demand', name: 'Public Demand', text: 'Move any figure to the front of the line.', effect: { kind: 'move_to_front' } },
  { id: 'fled_dubai', name: 'Fled to Dubai', text: 'Discard any one figure from the line.', effect: { kind: 'remove_from_line' } },
  { id: 'opinionated', name: 'Opinionated Guards', text: 'Rearrange the front 4 figures in any order.', effect: { kind: 'rearrange_front_n', n: 4 } },
  { id: 'bribed', name: 'Bribed Guards', text: 'Move the front figure to the end of the line.', effect: { kind: 'front_to_end' } },
  { id: 'identity_swap', name: 'Identity Swap', text: 'Discard any one figure from the line and replace it from the deck.', effect: { kind: 'discard_and_replace' } },
  { id: 'algo_shuffle', name: 'Algorithm Shuffle', text: 'Randomly rearrange the front 5 figures.', effect: { kind: 'randomize_front_n', n: 5 }, copies: 2 },
  { id: 'private_jet', name: 'Private Jet Escape', text: 'Randomly discard 2 figures, then randomly rearrange the rest.', effect: { kind: 'escape' } },
  { id: 'long_walk', name: 'The Long Walk', text: 'Reverse the order of the line.', effect: { kind: 'reverse_line' } },
  { id: 'mass_confusion', name: 'Mass Confusion', text: 'Return the line to the deck, shuffle, and deal a new line.', effect: { kind: 'redeal_line' } },
  { id: 'extra_live', name: 'Extra Load', text: 'Add 3 figures from the deck to the end of the line.', effect: { kind: 'add_nobles_to_end', count: 3 }, copies: 2 },
  { id: 'late_arrival', name: 'Late Arrival', text: 'Look at the top 3 of the figures deck; put one at the end of the line. Put the others back on top.', effect: { kind: 'late_arrival' } },
  { id: 'leak_dump', name: 'Leak Dump', text: 'Take any one card of your choice from the action discard pile.', effect: { kind: 'from_discard' } },
  { id: 'pol_influence', name: 'Political Influence', text: 'Draw 3 action cards. Do not collect a figure this turn.', effect: { kind: 'draw_skip_collect', count: 3 }, copies: 2 },
  { id: 'rain_delay', name: 'Rain Delay', text: 'All players discard their hands and draw new hands of equal size.', effect: { kind: 'rain_delay' } },
  { id: 'callous', name: 'Callous Guards', text: 'Play in front of you. Line-altering actions may not be played. You may discard this anytime.', effect: { kind: 'callous_guards' } },
  { id: 'missing', name: 'Missing Heads', text: 'Choose a player. They discard a random figure from their score pile.', effect: { kind: 'random_lose_noble' } },
  { id: 'missed', name: 'Missed!', text: 'Choose another player. Put the last figure they collected back at the end of the line.', effect: { kind: 'missed' } },
  { id: 'tough', name: 'Tough Crowd', text: 'Play in front of another player. They get −2 points.', effect: { kind: 'front_penalty', amount: 2 } },
  { id: 'twist', name: 'Twist of Fate', text: 'Discard a face-up action card in play.', effect: { kind: 'discard_front_card' } },
  { id: 'rush', name: 'Rush Job', text: 'Choose a player. They cannot play an action on their next turn.', effect: { kind: 'skip_opponent_turn' } },
  { id: 'clerical', name: 'Clerical Error', text: 'Collect a figure from an opponent’s pile; they then collect a different one from yours.', effect: { kind: 'clerical_error' } },
  { id: 'lack_support', name: 'Lack of Support', text: 'Look at a player’s hand and discard one of their action cards.', effect: { kind: 'discard_from_hand' } },
  { id: 'forced', name: 'Forced Break', text: 'Each other player discards one random action card.', effect: { kind: 'all_discard_random' } },
  { id: 'infighting', name: 'Infighting', text: 'Choose a player. They discard 2 action cards from their hand.', effect: { kind: 'discard_n_from_hand', count: 2 } },
  { id: 'info_exchange', name: 'Information Exchange', text: 'Exchange hands with another player.', effect: { kind: 'swap_hands' } },
  { id: 'confusion', name: 'Confusion in Line', text: 'Randomly rearrange the entire line.', effect: { kind: 'randomize_line' } },
  { id: 'venture', name: 'Legislative Support', text: 'Play in front of you. +1 point for each Legislative figure in your score pile.', effect: { kind: 'support_suit', suit: 'legislative' } },
  { id: 'popular', name: 'Judicial Support', text: 'Play in front of you. +1 point for each Judicial figure in your score pile.', effect: { kind: 'support_suit', suit: 'judicial' } },
  { id: 'network', name: 'Media Support', text: 'Play in front of you. +1 point for each Media figure in your score pile.', effect: { kind: 'support_suit', suit: 'media' } },
  { id: 'indifferent', name: 'Indifferent Public', text: 'Play in front of you. Your Martyrs are worth +1 each instead of their printed values.', effect: { kind: 'indifferent_public' } },
  { id: 'fountain', name: 'Fountain of Blood', text: 'Play in front of you. Worth +2 points.', effect: { kind: 'fountain_of_blood' } },
  { id: 'foreign', name: 'Executive Support', text: 'Play in front of you. Draw an action whenever you collect an Executive figure.', effect: { kind: 'foreign_support' } },
  { id: 'spoilsport', name: 'Spoilsport', text: 'End the day after your turn.', effect: { kind: 'end_day_after_turn' } },
];

export function expandActions(): ActionDef[] {
  const out: ActionDef[] = [];
  for (const a of ACTIONS) {
    const copies = a.copies ?? 1;
    for (let i = 0; i < copies; i++) {
      out.push({
        ...a,
        id: copies > 1 ? `${a.id}_${i + 1}` : a.id,
        copies: 1,
      });
    }
  }
  return out;
}

export function nobleById(id: string): NobleDef | undefined {
  const base = id.replace(/_\d+$/, '');
  return expandNobles().find((n) => n.id === id) || NOBLES.find((n) => n.id === id || n.id === base);
}

export function actionById(id: string): ActionDef | undefined {
  const base = id.replace(/_\d+$/, '');
  return expandActions().find((a) => a.id === id) || ACTIONS.find((a) => a.id === id || a.id === base);
}

export const SUIT_LABEL: Record<string, string> = {
  executive: 'Executive',
  legislative: 'Legislative',
  judicial: 'Judicial',
  media: 'Media',
  martyr: 'Martyr',
};

export const SUIT_COLOR: Record<string, string> = {
  executive: '#8b5cf6',
  legislative: '#ef4444',
  judicial: '#22c55e',
  media: '#3b82f6',
  martyr: '#a3a3a3',
};
