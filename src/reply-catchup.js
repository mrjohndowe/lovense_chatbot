/**
 * Returns the incoming text tail that has not yet been answered. A reply is
 * considered present only when a later outgoing text message exists; notices,
 * images, and other non-text Lovense entries do not change that decision.
 */
export function unrepliedIncomingText(messages) {
  const textMessages = (messages || []).filter(message =>
    message?.type === 'text' && message.text && (message.direction === 'incoming' || message.direction === 'outgoing')
  );
  if (!textMessages.length || textMessages.at(-1).direction !== 'incoming') return [];

  let lastOutgoingIndex = -1;
  for (let index = textMessages.length - 1; index >= 0; index -= 1) {
    if (textMessages[index].direction === 'outgoing') {
      lastOutgoingIndex = index;
      break;
    }
  }
  return textMessages.slice(lastOutgoingIndex + 1).filter(message => message.direction === 'incoming');
}
