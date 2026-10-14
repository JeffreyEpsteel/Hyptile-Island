# Wave 19C: a crew with lives

Read COMMON.md, w19-common.md, then src/features/crew/** (Crew.js posts: gunners, anglers; Deck.js: where they stand and
what they play; berths per hull), src/game/Characters.js (the roster and CLIPS: 27 new way-of-life clips since wave 18:
Sit_Chair, Drink, Eat, Fish_Net, Talk_Group, Kneel_Work, Hammer, Carry_Box, Crouch, Clap, Dance_2, Drunk_Walk, Walk_Tired ...),
src/game/HudPanels.js (read only: the crew tab at Ethena's), src/features/harbour (the tavern: where crew could be hired),
src/features/trade/Operating.js (wages), src/features/naval (read only: guns, fire, flooding, boarding), src/features/
boarding (read only: crew could join a boarding), src/features/story (read only), src/features/emotes (read only).

Owned files: src/features/crew/**, test/feature-crew*.mjs. Report Game.js / HudPanels.js / Operating.js / boarding patches.

1. Personalities: each crew member (the roster characters you hire) gets traits (brave, lazy, lucky, drunkard, cook, sharp-
   eyed, seasick), a mood / morale (wages paid, food, rest, victories, storms, losses), skills that grow with use (gunnery:
   reload time and aim; angling: bite rate; sailing: speed bonus at the helm; repair: hull / fire / flood work), and a
   level shown in the crew tab.
2. Life aboard: off duty they sit, eat, drink, mend nets, play dice, sleep under the awning at night; on duty they work
   their post visibly (gunners ram and aim, anglers cast and mend, a cook at the stove, a lookout who calls sails and
   whales); they fight fires and pump on their own when the ship burns or floods (naval's fire / flood APIs), and the
   brave ones join a boarding fight (boarding's crew hook: report the patch).
3. Banter: short speech bubbles / toasts on events (a catch, a sail sighted, a storm, a hit, a win), never spammy, per
   personality; a crew member can quit at the next port if morale bottoms out, or be found drunk at the tavern.
4. Hiring at taverns: a few named sailors for hire in each port's tavern (not only Ethena's roster), with traits and a
   price; the tavern keeper vouches for them.
5. Tests: morale arithmetic, skill growth caps, the off-duty schedule, fire / flood response, quitting, hiring, save round-
   trip (crew state in toJSON). Report under 300 words.
