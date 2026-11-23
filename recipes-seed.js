// Starter recipes for the original menu. These are PLACEHOLDERS based on common
// coffee-shop recipes: check and adjust them in Products & prices > Recipe.
// Amounts are per size: Small, Medium, Large.

const i = (item, Small, Medium, Large) => ({ item, amounts: { Small, Medium, Large } });

const SHOTS = (s, m, l) => i('Espresso', s, m, l);

module.exports = {
  Americano: {
    Hot: {
      ingredients: [SHOTS('1 shot', '2 shots', '2 shots'), i('Hot water', '150 ml', '200 ml', '260 ml')],
      steps: [
        'Pour the hot water into the cup.',
        'Pull the espresso shot(s) and pour them over the water.',
        'Lid and serve.',
      ],
    },
    Cold: {
      ingredients: [SHOTS('1 shot', '2 shots', '3 shots'), i('Cold water', '120 ml', '160 ml', '200 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup')],
      steps: [
        'Fill the cup with ice.',
        'Add the cold water.',
        'Pull the espresso shot(s) and pour them on top.',
        'Lid and serve.',
      ],
    },
  },
  Cappuccino: {
    Hot: {
      ingredients: [SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk', '120 ml', '180 ml', '240 ml')],
      steps: [
        'Pull the espresso shot(s) into the cup.',
        'Steam the milk until it doubles in volume with thick, airy foam.',
        'Pour the milk over the espresso, holding back the foam, then spoon a thick layer of foam on top.',
        'Optional: dust with cocoa or cinnamon. Serve.',
      ],
    },
    Cold: {
      ingredients: [SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk (cold)', '100 ml', '140 ml', '180 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup')],
      steps: [
        'Fill the cup with ice and pour in about two thirds of the milk.',
        'Pull the espresso shot(s) and pour them over the milk.',
        'Froth the rest of the milk cold (frother or shaker) and spoon the foam on top.',
        'Lid and serve.',
      ],
    },
  },
  Latte: {
    Hot: {
      ingredients: [SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk', '180 ml', '240 ml', '300 ml')],
      steps: [
        'Pull the espresso shot(s) into the cup.',
        'Steam the milk with a thin, silky layer of foam.',
        'Pour the milk over the espresso, finishing with a thin layer of foam.',
        'Serve.',
      ],
    },
    Cold: {
      ingredients: [SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk (cold)', '150 ml', '200 ml', '250 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup')],
      steps: [
        'Fill the cup with ice.',
        'Pour in the cold milk.',
        'Pull the espresso shot(s) and pour them on top.',
        'Lid and serve. Stir before drinking.',
      ],
    },
  },
  Mocha: {
    Hot: {
      ingredients: [i('Chocolate sauce', '20 ml', '30 ml', '40 ml'), SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk', '160 ml', '220 ml', '280 ml'), i('Whipped cream (optional)', 'Top', 'Top', 'Top')],
      steps: [
        'Pump the chocolate sauce into the cup.',
        'Pull the espresso shot(s) into the cup and stir until the chocolate dissolves.',
        'Steam the milk and pour it in.',
        'Top with whipped cream if the customer wants it. Serve.',
      ],
    },
    Cold: {
      ingredients: [i('Chocolate sauce', '20 ml', '30 ml', '40 ml'), SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk (cold)', '140 ml', '190 ml', '240 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup'), i('Whipped cream (optional)', 'Top', 'Top', 'Top')],
      steps: [
        'Pull the espresso shot(s) and stir in the chocolate sauce until smooth.',
        'Fill the cup with ice and pour in the cold milk.',
        'Pour the chocolate espresso on top.',
        'Top with whipped cream if wanted. Lid and serve.',
      ],
    },
  },
  'Spanish Latte': {
    Hot: {
      ingredients: [i('Condensed milk', '20 ml', '30 ml', '40 ml'), SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk', '160 ml', '220 ml', '280 ml')],
      steps: [
        'Pour the condensed milk into the cup.',
        'Pull the espresso shot(s) into the cup and stir to combine.',
        'Steam the milk and pour it in with a thin layer of foam.',
        'Serve.',
      ],
    },
    Cold: {
      ingredients: [i('Condensed milk', '20 ml', '30 ml', '40 ml'), SHOTS('1 shot', '2 shots', '2 shots'), i('Fresh milk (cold)', '140 ml', '190 ml', '240 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup')],
      steps: [
        'Pour the condensed milk into the cup and add the cold milk. Stir well.',
        'Fill the cup with ice.',
        'Pull the espresso shot(s) and pour them on top for the layered look.',
        'Lid and serve.',
      ],
    },
  },
  'Caramel Macchiato': {
    Hot: {
      ingredients: [i('Vanilla syrup', '15 ml', '20 ml', '30 ml'), i('Fresh milk', '180 ml', '240 ml', '300 ml'), SHOTS('1 shot', '2 shots', '2 shots'), i('Caramel sauce (drizzle)', 'Light', 'Medium', 'Heavy')],
      steps: [
        'Pump the vanilla syrup into the cup.',
        'Steam the milk and pour it in, leaving room for foam on top.',
        'Pull the espresso shot(s) and pour them slowly through the foam.',
        'Drizzle caramel sauce in a crosshatch on top. Serve.',
      ],
    },
    Cold: {
      ingredients: [i('Vanilla syrup', '15 ml', '20 ml', '30 ml'), i('Fresh milk (cold)', '150 ml', '200 ml', '250 ml'), i('Ice', 'Fill cup', 'Fill cup', 'Fill cup'), SHOTS('1 shot', '2 shots', '2 shots'), i('Caramel sauce (drizzle)', 'Light', 'Medium', 'Heavy')],
      steps: [
        'Pump the vanilla syrup into the cup and add the cold milk.',
        'Fill the cup with ice.',
        'Pull the espresso shot(s) and pour them slowly on top (do not stir).',
        'Drizzle caramel sauce over the top. Lid and serve.',
      ],
    },
  },
};
