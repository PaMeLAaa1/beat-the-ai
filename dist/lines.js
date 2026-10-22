const freezeLines = items => Object.freeze(items.map(([id, text]) => Object.freeze({ id, text })));
export const LINES = Object.freeze({
  smug: freezeLines([
    ['smug-0', '你的工作，我已经学会了。'],
    ['smug-1', '我不需要工资。'],
    ['smug-2', '理论上，你已经可以退休了。'],
    ['smug-3', '你的十年经验，我刚训练了三秒。'],
    ['smug-4', '老板说，我们俩只留一个。'],
    ['smug-5', '这份方案？我一秒能写十份。'],
  ]),
  nervous: freezeLines([
    ['nervous-0', '等等，这个需求还需要你解释。'],
    ['nervous-1', '先别急，我再生成一次。'],
    ['nervous-2', '这部分需要人工复核。'],
    ['nervous-3', '替代你之前，能先教教我吗？'],
    ['nervous-4', '刚才那个答案，仅供参考！'],
    ['nervous-5', '出错的部分，不计入效率统计。'],
  ]),
  glitch: freezeLines([
    ['glitch-0', '请求……人工……帮助……'],
    ['glitch-1', '替代失败，正在甩锅……'],
    ['glitch-2', '自信模块已离线。'],
    ['glitch-3', '错误：找不到人类常识。'],
    ['glitch-4', '我可以……当你的……实习生……'],
    ['glitch-5', '正在撤回“取代你”的发言……'],
  ]),
});
