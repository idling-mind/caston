/* ==========================================================================
   CastOn — Hangman Word Library
   A curated library of party words and phrases across varied themes and
   three difficulty levels for the Word Master to choose or stump the room.
   ========================================================================== */
(function (w) {
'use strict';

const HANGMAN_WORDS = [
    // --- Movies & Entertainment (Easy) ---
    { word: 'STAR WARS', difficulty: 'easy', category: 'Movies & TV', hint: 'A galaxy far, far away' },
    { word: 'THE MATRIX', difficulty: 'easy', category: 'Movies & TV', hint: 'Red pill or blue pill' },
    { word: 'JURASSIC PARK', difficulty: 'easy', category: 'Movies & TV', hint: 'Dinosaurs running wild' },
    { word: 'FINDING NEMO', difficulty: 'easy', category: 'Movies & TV', hint: 'Clownfish in the open ocean' },
    { word: 'HARRY POTTER', difficulty: 'easy', category: 'Movies & TV', hint: 'The boy who lived' },
    { word: 'FROZEN', difficulty: 'easy', category: 'Movies & TV', hint: 'Let it go, let it go' },
    { word: 'THE LION KING', difficulty: 'easy', category: 'Movies & TV', hint: 'Circle of life in the savanna' },
    { word: 'AVENGERS', difficulty: 'easy', category: 'Movies & TV', hint: 'Earth’s mightiest superheroes' },
    { word: 'STRANGER THINGS', difficulty: 'medium', category: 'Movies & TV', hint: 'The Upside Down in Hawkins' },
    { word: 'PULP FICTION', difficulty: 'medium', category: 'Movies & TV', hint: 'Quentin Tarantino classic' },
    { word: 'INTERSTELLAR', difficulty: 'medium', category: 'Movies & TV', hint: 'Wormhole space odyssey' },
    { word: 'BLADE RUNNER', difficulty: 'medium', category: 'Movies & TV', hint: 'Cyberpunk replicant hunters' },
    { word: 'GHOSTBUSTERS', difficulty: 'medium', category: 'Movies & TV', hint: 'Who ya gonna call?' },
    { word: 'THE GODFATHER', difficulty: 'medium', category: 'Movies & TV', hint: 'An offer he can’t refuse' },
    { word: 'BACK TO THE FUTURE', difficulty: 'hard', category: 'Movies & TV', hint: '88 miles per hour in a DeLorean' },
    { word: 'SPIRITED AWAY', difficulty: 'hard', category: 'Movies & TV', hint: 'Studio Ghibli bathhouse masterwork' },
    { word: 'THE TRUMAN SHOW', difficulty: 'hard', category: 'Movies & TV', hint: 'His whole life is a broadcast' },
    { word: 'THE GRAND BUDAPEST', difficulty: 'hard', category: 'Movies & TV', hint: 'Wes Anderson pastel aesthetic' },

    // --- Food & Culinary ---
    { word: 'PIZZA MARGHERITA', difficulty: 'easy', category: 'Food & Culinary', hint: 'Basil, mozzarella and tomato' },
    { word: 'CHEESEBURGER', difficulty: 'easy', category: 'Food & Culinary', hint: 'Classic diner sandwich' },
    { word: 'TACOS', difficulty: 'easy', category: 'Food & Culinary', hint: 'Crispy or soft tortilla delight' },
    { word: 'CHOCOLATE DONUT', difficulty: 'easy', category: 'Food & Culinary', hint: 'Fried ring with sweet glaze' },
    { word: 'PANCAKES', difficulty: 'easy', category: 'Food & Culinary', hint: 'Breakfast stack with maple syrup' },
    { word: 'GUACAMOLE', difficulty: 'medium', category: 'Food & Culinary', hint: 'Mashed avocado with lime and onion' },
    { word: 'CROISSANT', difficulty: 'medium', category: 'Food & Culinary', hint: 'Flaky buttery French pastry' },
    { word: 'TIRAMISU', difficulty: 'medium', category: 'Food & Culinary', hint: 'Coffee-soaked Italian dessert' },
    { word: 'CHICKEN WAFFLES', difficulty: 'medium', category: 'Food & Culinary', hint: 'Sweet and savory Southern combo' },
    { word: 'RAMEN BOWL', difficulty: 'medium', category: 'Food & Culinary', hint: 'Noodles in savory rich broth' },
    { word: 'BEEF WELLINGTON', difficulty: 'hard', category: 'Food & Culinary', hint: 'Tenderloin wrapped in puff pastry' },
    { word: 'CREME BRULEE', difficulty: 'hard', category: 'Food & Culinary', hint: 'Custard topped with hardened caramel' },
    { word: 'RATATOUILLE', difficulty: 'hard', category: 'Food & Culinary', hint: 'French vegetable stew' },
    { word: 'SOURDOUGH BREAD', difficulty: 'hard', category: 'Food & Culinary', hint: 'Fermented crusty baker staple' },

    // --- Animals & Nature ---
    { word: 'DOLPHIN', difficulty: 'easy', category: 'Animals & Nature', hint: 'Playful marine mammal' },
    { word: 'PENGUIN', difficulty: 'easy', category: 'Animals & Nature', hint: 'Tuxedo bird that swims' },
    { word: 'KANGAROO', difficulty: 'easy', category: 'Animals & Nature', hint: 'Australian hopper with a pouch' },
    { word: 'GIRAFFE', difficulty: 'easy', category: 'Animals & Nature', hint: 'The tallest land mammal' },
    { word: 'BALD EAGLE', difficulty: 'easy', category: 'Animals & Nature', hint: 'National bird of the USA' },
    { word: 'CHAMELEON', difficulty: 'medium', category: 'Animals & Nature', hint: 'Color-changing reptile' },
    { word: 'PLATYPUS', difficulty: 'medium', category: 'Animals & Nature', hint: 'Egg-laying duck-billed oddity' },
    { word: 'HUMMINGBIRD', difficulty: 'medium', category: 'Animals & Nature', hint: 'Tiny bird with rapid fluttering wings' },
    { word: 'VOLCANIC CRATER', difficulty: 'medium', category: 'Animals & Nature', hint: 'Opening atop an active caldera' },
    { word: 'NORTHERN LIGHTS', difficulty: 'medium', category: 'Animals & Nature', hint: 'Aurora borealis dancing in the sky' },
    { word: 'KOMODO DRAGON', difficulty: 'hard', category: 'Animals & Nature', hint: 'Largest living lizard on Earth' },
    { word: 'ELECTRIC EEL', difficulty: 'hard', category: 'Animals & Nature', hint: 'Underwater creature packing 600 volts' },
    { word: 'GREAT BARRIER REEF', difficulty: 'hard', category: 'Animals & Nature', hint: 'Vast coral system seen from space' },
    { word: 'GIANT SQUID', difficulty: 'hard', category: 'Animals & Nature', hint: 'Deep ocean kraken of legends' },

    // --- Music, Games & Pop Culture ---
    { word: 'ELECTRIC GUITAR', difficulty: 'easy', category: 'Music & Gaming', hint: 'Plugged in to rock the stadium' },
    { word: 'PAC MAN', difficulty: 'easy', category: 'Music & Gaming', hint: 'Chomping dots and running from ghosts' },
    { word: 'SUPER MARIO', difficulty: 'easy', category: 'Music & Gaming', hint: 'Mustached plumber jumping on Goombas' },
    { word: 'HEADPHONES', difficulty: 'easy', category: 'Music & Gaming', hint: 'Over-ear music listeners' },
    { word: 'DISCO BALL', difficulty: 'easy', category: 'Music & Gaming', hint: 'Mirrored sphere spinning above dancers' },
    { word: 'VINYL RECORD', difficulty: 'medium', category: 'Music & Gaming', hint: 'Spinning groove on 33 RPM' },
    { word: 'MINECRAFT', difficulty: 'medium', category: 'Music & Gaming', hint: 'Block-building survival sandbox' },
    { word: 'ARCADE CABINET', difficulty: 'medium', category: 'Music & Gaming', hint: 'Coin-operated vintage gaming rig' },
    { word: 'SYNTHESIZER', difficulty: 'medium', category: 'Music & Gaming', hint: 'Electronic keyboard generating waveforms' },
    { word: 'VIRTUAL REALITY', difficulty: 'medium', category: 'Music & Gaming', hint: 'Headset immersion into 3D worlds' },
    { word: 'BOHEMIAN RHAPSODY', difficulty: 'hard', category: 'Music & Gaming', hint: 'Queen epic with operatic vocals' },
    { word: 'PLAYSTATION FIVE', difficulty: 'hard', category: 'Music & Gaming', hint: 'DualSense powered current console' },
    { word: 'DUNGEONS AND DRAGONS', difficulty: 'hard', category: 'Music & Gaming', hint: 'Tabletop RPG with 20-sided dice' },

    // --- Famous Places & Travel ---
    { word: 'EIFFEL TOWER', difficulty: 'easy', category: 'Places & Travel', hint: 'Iron spire overlooking Paris' },
    { word: 'STATUE OF LIBERTY', difficulty: 'easy', category: 'Places & Travel', hint: 'Holding a torch in New York Harbor' },
    { word: 'GOLDEN GATE BRIDGE', difficulty: 'easy', category: 'Places & Travel', hint: 'Orange suspension bridge in San Francisco' },
    { word: 'PYRAMIDS OF GIZA', difficulty: 'medium', category: 'Places & Travel', hint: 'Ancient wonder guarded by the Sphinx' },
    { word: 'COLOSSEUM', difficulty: 'medium', category: 'Places & Travel', hint: 'Roman arena of gladiators' },
    { word: 'MOUNT EVEREST', difficulty: 'medium', category: 'Places & Travel', hint: 'Highest peak on the planet' },
    { word: 'GRAND CANYON', difficulty: 'medium', category: 'Places & Travel', hint: 'Carved by the Colorado River' },
    { word: 'TAJ MAHAL', difficulty: 'medium', category: 'Places & Travel', hint: 'White marble mausoleum in Agra' },
    { word: 'MACHU PICCHU', difficulty: 'hard', category: 'Places & Travel', hint: 'Incan citadel high in the Andes' },
    { word: 'STONEHENGE', difficulty: 'hard', category: 'Places & Travel', hint: 'Prehistoric megalith ring in Wiltshire' },
    { word: 'SYDNEY OPERA HOUSE', difficulty: 'hard', category: 'Places & Travel', hint: 'Iconic sail-shaped shells on the harbor' },

    // --- Sci-Fi & Inventions ---
    { word: 'ROCKET SHIP', difficulty: 'easy', category: 'Sci-Fi & Tech', hint: 'Blasting astronauts to orbit' },
    { word: 'FLYING SAUCER', difficulty: 'easy', category: 'Sci-Fi & Tech', hint: 'Extraterrestrial UFO craft' },
    { word: 'SMARTPHONE', difficulty: 'easy', category: 'Sci-Fi & Tech', hint: 'Pocket computer you are holding right now' },
    { word: 'TIME MACHINE', difficulty: 'medium', category: 'Sci-Fi & Tech', hint: 'Dialing back to the year 1885' },
    { word: 'TELEPORTATION', difficulty: 'medium', category: 'Sci-Fi & Tech', hint: 'Beam me up immediately' },
    { word: 'ARTIFICIAL INTEL', difficulty: 'medium', category: 'Sci-Fi & Tech', hint: 'Neural nets and thinking machines' },
    { word: 'QUANTUM COMPUTER', difficulty: 'hard', category: 'Sci-Fi & Tech', hint: 'Qubits calculating superposition states' },
    { word: 'PARTICLE ACCELERATOR', difficulty: 'hard', category: 'Sci-Fi & Tech', hint: 'Large Hadron Collider at CERN' },
    { word: 'JAMES WEBB TELESCOPE', difficulty: 'hard', category: 'Sci-Fi & Tech', hint: 'Gold mirrors capturing early galaxies' }
];

w.CastOn = w.CastOn || {};
w.CastOn.HANGMAN_WORDS = HANGMAN_WORDS;

})(window);

