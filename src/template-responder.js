import { composeLocalSentence } from './sentence-composer.js';
import { WORD_LIBRARY as words } from './word-library.js';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function americanDate(value) {
  const [month, day, year] = value.split('/').map(Number);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${monthName} ${day}, ${year}`;
}

function last(history, role) {
  return clean([...history].reverse().find(item => item?.role === role)?.content);
}

export function expandedTemplateReply(config, message, history = []) {
  const text = clean(message);
  const priorAssistant = last(history, 'assistant');
  const priorUser = last(history, 'user');
  const userTurns = history.filter(item => item?.role === 'user').length;
  const choose = choices => choices[(hash(text.toLowerCase() + '\0' + priorAssistant) + userTurns) % choices.length];
  const compose = (intent, tone = 'neutral') => composeLocalSentence({ intent, tone, message: text, history });
  const name = config.chatDisplayName || [config.chatFirstName, config.chatLastName].filter(Boolean).join(' ') || config.chatUsername;
  const unknown = followup => `I haven’t filled that detail in yet. ${followup}`;

  // Boundaries and distress always override playful tone.
  if (/\b(stop|don'?t do that|not comfortable|too much|slow down|leave me alone|no more)\b/i.test(text)) return choose(['Understood—I’ll stop. Are you okay?', 'Absolutely. Your boundary comes first. Do you want space or a normal conversation?', 'Got it. We can slow down or change the subject completely.']);
  if (/\b(i feel unsafe|i'?m scared|i am scared|panic|panicking)\b/i.test(text)) return 'Let’s pause. Get somewhere you feel safe, and tell me whether you need space or someone you trust nearby.';

  // Configured identity and demographics.
  if (/\b(what(?:’|'| i)s your name|who are you|what should i call you)\b/i.test(text)) return name ? `You can call me ${name}. What should I call you?` : unknown('What name do you like to use?');
  if (/\bwhat(?:’|'| i)s your first name\b/i.test(text)) return config.chatFirstName ? `My first name is ${config.chatFirstName}. What’s yours?` : unknown('What’s your first name?');
  if (/\b(what(?:’|'| i)s your last name|surname)\b/i.test(text)) return config.chatLastName ? `My last name is ${config.chatLastName}. What made you curious?` : unknown('What made you ask?');
  if (/\b(when is your birthday|what(?:’|'| i)s your birthday|date of birth|when were you born)\b/i.test(text)) return config.chatDateOfBirth ? `My birthday is ${americanDate(config.chatDateOfBirth)}. When is yours?` : unknown('When is your birthday?');
  if (/\b(where were you born|place of birth)\b/i.test(text)) return config.chatPlaceOfBirth ? `I was born in ${config.chatPlaceOfBirth}. Where were you born?` : unknown('Where were you born?');
  if (/\b(do you have (?:any )?(?:children|kids)|how many (?:children|kids)|are you a (?:parent|mom|mother|dad|father))\b/i.test(text)) return config.chatChildren ? `${config.chatChildren}. How about you?` : unknown('Do you have children?');
  if (/\b(how old are you|what(?:’|'| i)s your age)\b/i.test(text)) return config.chatAge ? `I’m ${config.chatAge}. How old are you?` : unknown('How old are you?');
  if (/\b(where are you from|where do you live|where are you located)\b/i.test(text)) return config.chatLocation ? `I’m in ${config.chatLocation}. Where are you from?` : unknown('Where are you from?');
  if (/\b(what do you do|what(?:’|'| i)s your job|where do you work|occupation)\b/i.test(text)) return config.chatOccupation ? `${config.chatOccupation}. What kind of work do you do?` : unknown('What do you do?');
  if (/\b(what are you into|what do you like|your interests|your hobbies)\b/i.test(text)) return config.chatInterests ? `I’m into ${config.chatInterests}. What can you talk about for hours?` : unknown('What are you into?');
  if (/\b(are you single|relationship status|do you have a partner|are you married)\b/i.test(text)) return config.chatRelationshipStatus ? `I’d describe it as ${config.chatRelationshipStatus}. What about you?` : unknown('What’s your situation?');
  if (/\b(what are your pronouns|which pronouns do you use)\b/i.test(text)) return config.chatPronouns ? `I use ${config.chatPronouns}. What do you use?` : unknown('What pronouns do you use?');

  // Repair misunderstandings using the immediately preceding assistant message.
  if (/\b(what do you mean|what did you mean|huh|i don'?t understand|explain)\b/i.test(text)) {
    if (/tell me (?:a little )?more|keep talking|what happened next/i.test(priorAssistant)) return 'I meant I was interested in what you were saying and wanted more of the story—not that you said anything wrong.';
    return priorAssistant ? `I may have worded that badly. I was responding to “${priorAssistant.slice(0, 100)}” Which part should I explain better?` : 'I may have missed some context. Which part should I explain?';
  }
  if (/\b(you didn'?t answer|answer my question|that makes no sense|you make no sense)\b/i.test(text)) return 'You’re right—I missed the point. Ask it once more and I’ll answer it directly.';

  // Keep ordinary story threads grounded in what the person actually said.
  // These run before broad topic/fallback rules so a detail such as "demeanor"
  // continues the existing discussion instead of starting a generic new one.
  if (/\b(she|he|they) (?:isn'?t|is not|ain'?t|won'?t|will not) coming back\b/i.test(text)) {
    return choose([
      'Yeah, it sounds like she may have made up her mind. What gave you that feeling?',
      'You might be right. Did something happen before she left?',
      'That sounds pretty final. Are you okay with her not coming back?'
    ]);
  }
  if (/\b(demeanou?r|attitude|behavior|body language|the way (?:she|he|they) acted)\b/i.test(text)) {
    if (/\b(she|her)\b/i.test(priorUser) || /\bshe\b/i.test(text)) return choose([
      'I get that. Was she acting distant, upset, or just completely done?',
      'Yeah, sometimes you can tell from how someone carries herself. Was she unusually cold?',
      'That can say a lot. Did she seem angry, or more like she had already checked out?'
    ]);
    if (/\b(he|him)\b/i.test(priorUser) || /\bhe\b/i.test(text)) return choose([
      'I get that. Was he acting distant, upset, or just completely done?',
      'Yeah, sometimes you can tell from how someone carries himself. Was he unusually cold?',
      'That can say a lot. Did he seem angry, or more like he had already checked out?'
    ]);
    return choose(['I get that. What was different about the way they were acting?', 'Yeah, body language can say a lot. Did they seem upset or just distant?', 'That can be telling. What did you notice?']);
  }

  // Greetings and casual shorthand.
  if (/\b(good morning|morning)\b/i.test(text)) return choose(['Good morning. How did you sleep?', 'Morning, you. What kind of day are you expecting?', 'Good morning 😊 What’s first on your agenda?']);
  if (/\b(good night|night night|going to bed|headed to bed)\b/i.test(text)) return choose(['Good night. Sleep well.', 'Rest well. What was the best part of your day?', 'Sweet dreams. I enjoyed talking with you tonight.']);
  if (/^(hi|hey|hello|hiya|yo)[!.? ]*$/i.test(text)) return choose(words.shortReplies.greeting);
  if (/^(hi|hey|hello|hiya|yo)\b/i.test(text)) return choose(['Hey, how is your day going?', 'Hi, what are you up to?', 'Hey there. How are you?', 'Hi! What is going on?']);
  if (/\b(hbu|how about you|how bout you)\b/i.test(text)) return choose(["I’m doing pretty well—just enjoying the conversation. What does a perfect chill evening look like for you?", "I’m good, taking it easy and getting to know you. What are you doing while you relax?", "I’m in a good mood. You’ve got my attention—what’s on your mind?"]);
  if (/\b(how are you|how(?:’|'| a)?re you|how you doing)\b/i.test(text)) return compose('wellbeing', 'warm');
  if (/\b(wyd|what are you doing|whatcha doing|what are you up to)\b/i.test(text)) return choose(["I’m relaxing and talking with you. What are you getting into?", 'Just taking it easy and enjoying our conversation. What about you?', 'Right now? Giving you my attention. What are you doing?']);

  // Emotional context.
  const emotionRules = [
    [/\b(i'?m|i am|i feel|feeling) (sad|down|upset|hurt|depressed)\b/i, ['Aw damn, that sucks.', "I'm sorry. Want to talk about it or get distracted?", "Ugh, I'm sorry you're dealing with that."]],
    [/\b(i'?m|i am|i feel|feeling) (stressed|overwhelmed|anxious|worried)\b/i, ["Ugh, that's rough.", 'Damn. Work stuff or personal?', 'Yeah, I hate days like that.']],
    [/\b(i'?m|i am|i feel|feeling) (tired|exhausted|sleepy)\b/i, ['Same kind of tired where you could sleep all day?', 'Ugh, long day?', 'Go get some rest, sleepyhead.']],
    [/\b(i'?m|i am|i feel|feeling) (bored|lonely)\b/i, ['Same. What are you doing right now?', 'Well, you found me.', 'Want to talk, flirt, or just be random?']],
    [/\b(i'?m|i am|i feel|feeling) (happy|great|good|excited|amazing)\b/i, ['I like hearing that. What happened?', 'Good—you sound energized. What are you excited about?', 'That mood looks good on you. What made your day?']]
  ];
  for (const [pattern, replies] of emotionRules) if (pattern.test(text)) return choose(replies);

  // Everyday subjects produce related follow-ups.
  const topicRules = [
    [/\b(work|job|boss|coworker|shift|office)\b/i, ['Ugh, rough shift?', 'Was it the work or the people?', 'At least work is over now.']],
    [/\b(dinner|lunch|breakfast|food|hungry|cooking|eat|eating)\b/i, ['What are you making?', 'Nice. What is for dinner?', 'Now you are making me hungry.']],
    [/\b(music|song|playlist|band|singer|concert)\b/i, ['Oh nice, what song?', 'Is it going straight on repeat?', 'I love finding new music.']],
    [/\b(movie|movies|show|series|watching|netflix|tv)\b/i, ['What are you watching?', 'Is the movie actually good?', 'Nice, I need a new show to watch.']],
    [/\b(game|gaming|xbox|playstation|pc game|nintendo)\b/i, ['What are you playing?', 'Are you winning at least?', 'Nice. I can lose a whole night to a good game.']],
    [/\b(gym|workout|exercise|running|hike|hiking)\b/i, ['How did it go—accomplished or exhausted?', 'What workouts do you actually enjoy?', 'What keeps you motivated?']],
    [/\b(weekend|tonight|tomorrow|plans|vacation|trip|travel)\b/i, [compose('plans')]],
    [/\b(weather|rain|raining|snow|cold|hot outside|sunny)\b/i, ['Do you enjoy that kind of weather?', 'Is it stay-inside weather there?', 'What do you like doing in weather like that?']]
  ];
  for (const [pattern, replies] of topicRules) if (pattern.test(text)) return choose(replies);

  // Connection, compliments, and consensual adult playfulness.
  if (/\b(i miss you|missed you)\b/i.test(text)) return choose(['I like knowing I crossed your mind. What did you miss?', 'I missed our conversation too. How have you been?', 'Then catch me up on everything I missed.']);
  if (/\byou(?:’re|'re| are) (?:really |so |very )?(cute|sweet|beautiful|handsome|hot|sexy|amazing)\b/i.test(text)) return choose(['Careful, compliments might work on me. What made you say that?', 'Thank you—you’re pretty charming yourself.', 'Keep talking like that and you’ll have all my attention 😉']);
  if (/\b(i like you|i love you|have a crush on you)\b/i.test(text)) return choose(['I like the connection too. What made you realize it?', 'That’s sweet and a little bold. What do you like most?', 'I’m enjoying you too. Let’s keep getting to know each other.']);
  if (/\b(send (?:me )?(?:a )?(?:pic|picture|photo)|show me (?:your|a)|video call|call me)\b/i.test(text)) return choose(['Maybe later. For now, tell me what you’re curious about.', 'I’d rather keep talking here for now. What were you hoping for?', 'Slow down—you don’t get everything at once. Get to know me first 😉']);
  if (/\b(be dominant|dominate me|control me|tell me what to do|take control)\b/i.test(text)) return compose('dating', 'dominant');
  if (/\b(toy|vibe|vibrator|live control|slider)\b/i.test(text)) return choose(['Tell me what intensity is comfortable and what your stop signal is.', 'We can make that playful, but I want clear boundaries first.', 'Tell me what feels good, what doesn’t, and when to stop.']);
  if (/\b(kiss|cuddle|snuggle|flirt|tease)\b/i.test(text)) return compose('dating', 'flirty');
  if (/\b(horny|turned on|naughty|dirty talk)\b/i.test(text)) return choose(['I can be playful, but tell me the mood and boundaries first.', 'Do you want teasing conversation or something more direct?', 'Use your words—what kind of attention are you asking for?']);

  // Acknowledgements and laughter maintain continuity.
  if (/^(thanks|thank you|ty)\b/i.test(text)) return choose(["You’re welcome. What’s on your mind now?", 'Anytime. Where should we take this next?', 'You’re welcome 😊 Tell me something else about you.']);
  if (/^(yes|yeah|yep|sure|okay|ok)\b/i.test(text)) return choose(['Good. Tell me more about that.', 'All right—I’m with you. What happens next?', 'I like a clear answer. Keep going.']);
  if (/^(no|nope|nah)\b/i.test(text)) return choose(['Fair enough. What would you prefer?', 'Got it—we’ll leave that alone. What do you want to discuss?', 'No problem. Point me in a better direction.']);
  if (/\b(lol|lmao|haha|that'?s funny)\b/i.test(text)) return choose(['I’m glad I made you laugh. What’s so funny?', 'There’s that laugh I was hoping for.', 'Good, I like that reaction 😏']);

  // Additional conversational subjects from the expanded offline library.
  const expandedTopics = [
    [/\b(date|dating|chemistry|green flag|relationship)\b/i, [compose('dating')]],
    [/\b(pet|pets|dog|cat|animal)\b/i, [compose('pets', 'warm')]],
    [/\b(family|sister|brother|sibling|parents|mother|father)\b/i, [compose('family', 'warm')]],
    [/\b(home|house|apartment|room|decorate)\b/i, [compose('home')]],
    [/\b(sleep|dream|bed|night owl|early bird)\b/i, [compose('sleep', 'warm')]],
    [/\b(outside|outdoors|beach|mountain|forest|camping|sunset|sunrise)\b/i, [compose('outdoors')]],
    [/\b(personality|introvert|extrovert|quiet|outgoing|habit)\b/i, [compose('personality')]],
    [/\b(goal|goals|dream job|future|accomplish|success)\b/i, [compose('goals', 'warm')]],
    [/\b(memory|memories|childhood|school|grew up)\b/i, [compose('memories', 'warm')]],
    [/\b(joke|funny|humor|sarcastic|laugh)\b/i, [compose('humor', 'flirty')]]
  ];
  for (const [pattern, replies] of expandedTopics) if (pattern.test(text)) return choose(replies);

  // Question fallbacks ask for the missing context instead of inventing facts.
  if (/\bwhy\b.*\?$/i.test(text)) return choose(['What happened that made you ask?', priorUser ? `Are you asking because of “${priorUser.slice(0, 70)}”?` : 'Give me a little context and I’ll answer directly.', 'Give me a little context and I’ll answer directly.']);
  if (/\b(where|when|who)\b.*\?$/i.test(text)) return 'Give me one more detail about what you mean and I’ll answer directly.';
  if (/\bhow\b.*\?$/i.test(text)) return choose(['Tell me what result you want and I’ll give you a useful answer.', 'What part are you stuck on?', 'Give me one more detail so I don’t guess.']);
  if (/\?$/.test(text)) return choose(['What part of that matters most to you?', 'That depends on what you have in mind—give me a little context.', 'I’m not going to pretend I understood perfectly. Can you say a little more?']);

  // Statement fallbacks still reflect the incoming message.
  if (/\b(yesterday|today|earlier|last night|this morning)\b/i.test(text)) return choose(['Wow, so that was pretty recent.', "Yeah, I'd still be thinking about that too.", 'That just happened then.']);
  if (text.length < 12) return choose(['What happened?', 'How come?', 'Really?', 'Go on.', 'What do you mean?']);
  return compose('general');
}


