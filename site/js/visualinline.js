// Pure: which calm note replaces a picture or page in the chat, or '' when it can be shown.
export const NOTE_CLOUD = 'This file is on the cloud session, not on this PC.';
export const NOTE_PAGE = 'This page could not be shown here.';
export const inlineNote = (item) => (item ? '' : NOTE_CLOUD);
