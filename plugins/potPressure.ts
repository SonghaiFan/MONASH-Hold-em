import { defineVariablePlugin } from './api';

export const potPressure = defineVariablePlugin({
  apiVersion: 1,
  id: 'example.pot-pressure',
  version: '1.0.0',
  requires: ['poker.core'],
  fields: [{
    path: 'pressure.callFraction',
    label: {en:'Call as a share of stack', zh:'跟注占筹码比例'},
    desc: {en:'Fraction of remaining chips needed to call, from 0 to 1.', zh:'跟注所需筹码占剩余筹码的比例，范围 0 到 1。'},
    group: 'maths', example: '0.1',
  }],
  compute({context, state}) {
    const toCall = state.toCall;
    return {pressure: {callFraction: context.hero.chips > 0 && typeof toCall === 'number' ? toCall / context.hero.chips : undefined}};
  },
});
