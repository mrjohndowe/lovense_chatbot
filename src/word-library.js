// Word and phrase fragments used by the offline grammar composer.
// These are ingredients, not complete canned chat replies.
export const WORD_LIBRARY = Object.freeze({
  openers: Object.freeze({
    neutral: ['Yeah', 'Okay', 'Hmm', 'I get that', 'Makes sense', 'Fair enough', 'Really', 'I can see that', 'Gotcha', 'Right'],
    warm: ['Aw', 'I like hearing that', 'That made me smile', 'I am glad you told me', 'You have my attention', 'That sounds lovely', 'I appreciate the honesty', 'I am listening', 'I like that', 'Good to know'],
    flirty: ['Well now', 'Careful', 'Look at you', 'That is tempting', 'You are distracting me', 'I see what you are doing', 'You are bold', 'Now you have my attention', 'That was smooth', 'Mmm'],
    dominant: ['Good', 'Listen carefully', 'Stay focused', 'Slow down', 'Use your words', 'Be direct', 'Hold that thought', 'Pay attention', 'Take a breath', 'Do not rush']
  }),
  reactions: Object.freeze({
    neutral: ['that makes sense', 'I get what you mean', 'I can see why', 'that sounds complicated', 'that is interesting', 'I would notice that too', 'you may be right', 'that explains a lot'],
    positive: ['your excitement is contagious', 'that energy suits you', 'you sound genuinely happy', 'that sounds like a win', 'I love the enthusiasm', 'you have every reason to smile', 'that is wonderful to hear', 'the good mood comes through'],
    supportive: ['that sounds like a lot to carry', 'you do not have to handle it alone', 'your feelings make sense', 'that must be exhausting', 'you deserve a gentler moment', 'I am not judging you', 'it is okay to take this slowly', 'you can be honest with me'],
    flirty: ['that confidence looks good on you', 'you know how to create tension', 'you are becoming a favorite distraction', 'that playful side is attractive', 'you make curiosity feel dangerous', 'you know exactly how to get a reaction', 'your timing is very good', 'I like where this energy is going'],
    dominant: ['clear communication comes first', 'I expect an honest answer', 'confidence works best with discipline', 'the pace stays deliberate', 'your comfort still controls the limit', 'I want your full attention', 'we establish boundaries before intensity', 'a direct answer earns a direct response']
  }),
  shortReplies: Object.freeze({
    greeting: ['Hi', 'Hey', 'Hello', 'Hey 😊', 'Hi, HRU?', 'HRU?', 'Hey, you', 'Hi there'],
    thanks: ['You’re welcome', 'Anytime', 'Of course', 'No problem', 'You got it'],
    yes: ['Okay', 'Good', 'Sounds good', 'Got it', 'All right'],
    no: ['Okay', 'No problem', 'Fair enough', 'Got it', 'That’s okay'],
    laughter: ['Lol', 'Haha', 'I know 😂', 'You’re funny', 'Glad you laughed']
  }),
  transitions: ['So', 'And', 'Now', 'Then', 'Still', 'Before anything else', 'More importantly', 'For me', 'At the same time', 'With that said'],
  questionLeads: ['tell me', 'help me understand', 'be honest about', 'describe', 'say more about', 'walk me through', 'give me the real answer about', 'let me know', 'think about', 'start with'],
  adjectives: ['interesting', 'unexpected', 'exciting', 'complicated', 'comforting', 'intense', 'sweet', 'playful', 'meaningful', 'memorable', 'challenging', 'relaxing', 'personal', 'honest', 'bold', 'thoughtful'],
  verbs: ['enjoy', 'notice', 'remember', 'want', 'prefer', 'appreciate', 'imagine', 'choose', 'explore', 'understand', 'value', 'expect', 'feel', 'consider', 'share', 'miss'],
  closers: ['I want the honest version', 'take your time answering', 'details make this more interesting', 'I am listening', 'you can be specific', 'do not overthink it', 'start wherever feels natural', 'I want to hear your side'],
  consent: ['name your boundaries first', 'tell me what feels comfortable', 'choose a clear stop signal', 'say what I should avoid', 'give me clear consent before we continue', 'set a comfortable pace that feels right', 'tell me your hard limits', 'remember your stop signal can pause this at any time'],
  topics: Object.freeze({
    greeting: { subjects: ['your day', 'your mood', 'what you are doing', 'your evening', 'what brought you here'], questions: ['how has your day been', 'what are you up to', 'what kind of mood are you in', 'what is on your mind', 'how is your evening going'] },
    wellbeing: { subjects: ['how you are feeling', 'your energy today', 'what has been on your mind', 'the kind of day you had', 'what you need tonight'], questions: ['how are you feeling honestly', 'what was the best part of your day', 'has today been kind to you', 'what would improve your mood', 'what is taking most of your energy'] },
    work: { subjects: ['your day at work', 'the people you work with', 'your job', 'what you accomplished', 'the hardest part of your shift'], questions: ['what happened at work', 'whether the work or the people were harder', 'what happened at work today', 'what would make your job easier', 'how you unwind after a long shift'] },
    food: { subjects: ['what you are cooking', 'your favorite meal', 'the food you are craving', 'your comfort food', 'what you ate today'], questions: ['what you are having', 'whether you are cooking or ordering', 'what your favorite comfort food is', 'which flavor you crave most', 'what meal you never get tired of'] },
    music: { subjects: ['your current playlist', 'the song in your head', 'your favorite artist', 'the music matching your mood', 'your best concert memory'], questions: ['what you have on repeat', 'which song matches your mood', 'whether lyrics or rhythm matter more', 'who you want to see live', 'what song always changes your mood'] },
    entertainment: { subjects: ['what you are watching', 'your favorite kind of story', 'the character you like', 'your latest series', 'your comfort movie'], questions: ['what you are watching', 'whether it is actually good', 'which character you like most', 'what you can watch repeatedly', 'what belongs next on the watch list'] },
    games: { subjects: ['the game you are playing', 'your competitive side', 'your favorite game world', 'the character you choose', 'your best gaming memory'], questions: ['what you are playing lately', 'whether you play to win or relax', 'which game steals your evening', 'whether you prefer solo or cooperative play', 'what game you would replay fresh'] },
    plans: { subjects: ['your plans', 'what you are looking forward to', 'your ideal weekend', 'the trip you want', 'how you spend free time'], questions: ['what you are hoping to do', 'which part excites you most', 'whether the plan is firm or spontaneous', 'where you would go with no limits', 'what makes a free evening perfect'] },
    dating: { subjects: ['what creates chemistry for you', 'your idea of a good date', 'the way you show affection', 'your biggest green flag', 'what makes you feel close'], questions: ['what attracts you before looks do', 'what makes a date memorable', 'how you usually show affection', 'what makes chemistry last', 'which quality matters most to you'] },
    pets: { subjects: ['your pets', 'the animal you relate to', 'your funniest pet story', 'the pet you would choose', 'how much you spoil animals'], questions: ['whether you have pets', 'what animal matches you', 'the funniest thing a pet has done', 'what you would name a new pet', 'whether pets belong on the bed'] },
    family: { subjects: ['your family', 'the person who knows you best', 'your siblings', 'your favorite tradition', 'a family memory'], questions: ['who makes you laugh most', 'whether you have siblings', 'which tradition you enjoy', 'who taught you the most', 'which relative you resemble'] },
    home: { subjects: ['what feels like home', 'your favorite room', 'your ideal place to live', 'the way you relax at home', 'your dream space'], questions: ['what makes a place feel like home', 'whether you prefer city life or quiet', 'what your dream home needs', 'where you relax best', 'how you spend a night at home'] },
    sleep: { subjects: ['your sleep', 'your dreams', 'your bedtime habits', 'your ideal morning', 'what keeps you awake'], questions: ['whether you slept well', 'if you are a night owl', 'what helps you unwind', 'whether you remember dreams', 'what your ideal morning looks like'] },
    outdoors: { subjects: ['your favorite place outside', 'the view you remember', 'your preferred season', 'your idea of adventure', 'where you go for fresh air'], questions: ['whether you prefer mountains or beaches', 'what outdoor activity clears your mind', 'whether you would camp', 'which season feels like you', 'whether sunrise or sunset wins'] },
    personality: { subjects: ['your personality', 'what people misunderstand', 'the quality you value in yourself', 'your spontaneous side', 'what brings out your best'], questions: ['what people misunderstand about you', 'whether you are quiet or outgoing', 'what makes you feel like yourself', 'which quality makes you proud', 'what your closest friend would say'] },
    goals: { subjects: ['what you are working toward', 'the future you want', 'a skill you want to learn', 'your definition of success', 'the dream you protect'], questions: ['what you want to accomplish', 'what motivates you', 'which skill you want to learn', 'what success looks like', 'what your next small step is'] },
    memories: { subjects: ['a memory that still makes you smile', 'what you loved as a kid', 'a trip you remember', 'your younger self', 'a moment you would revisit'], questions: ['which memory always makes you smile', 'what you loved doing as a kid', 'what moment you would revisit', 'which song takes you back', 'what your younger self would admire'] },
    humor: { subjects: ['your sense of humor', 'what made you laugh', 'your sarcastic side', 'your best terrible joke', 'the funniest person you know'], questions: ['what kind of humor gets you', 'what last made you laugh hard', 'whether you keep a straight face', 'what comedy you quote', 'what your best bad joke is'] },
    general: { subjects: ['what you just said', 'the part that matters most', 'your side of the story', 'what happened next', 'how you feel about it'], questions: ['what happened next', 'how it made you feel', 'what you want to happen', 'why it stayed on your mind', 'which detail matters most'] }
  })
});

