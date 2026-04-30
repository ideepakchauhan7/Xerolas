import {
  QUICK_ACTIONS,
  type AnalysisResult,
  type AskQuestionState,
  type QuickActionId,
  type ResultStreamState,
  type SourceLink
} from '../shared/types';

const resultPage = document.body as HTMLBodyElement;
const resultCard = document.querySelector('.result-card--minimal') as HTMLElement;
const resultShell = document.querySelector('.result-minimal-shell') as HTMLElement;
const resultTopbar = document.querySelector('.result-topbar') as HTMLDivElement;
const resultText = document.getElementById('result-text') as HTMLDivElement;
const quickActions = document.getElementById('quick-actions') as HTMLDivElement;
const groundingBadge = document.getElementById('grounding-badge') as HTMLDivElement;
const searchingBadge = document.getElementById('searching-badge') as HTMLDivElement;
const sourcesSection = document.getElementById('result-sources') as HTMLElement;
const sourcesList = document.getElementById('result-sources-list') as HTMLUListElement;
const askedQuestionDisplay = document.getElementById('ask-question-display') as HTMLElement;
const askedQuestionText = document.getElementById('ask-question-display-text') as HTMLParagraphElement;
const resultAskEntry = document.getElementById('result-ask-entry') as HTMLButtonElement;
const askQuestionComposer = document.getElementById('ask-question-composer') as HTMLElement;
const askQuestionInput = document.getElementById('ask-question-input') as HTMLTextAreaElement;
const askQuestionHelper = document.getElementById('ask-question-helper') as HTMLParagraphElement;
const askQuestionClose = document.getElementById('ask-question-close') as HTMLButtonElement;
const askQuestionSend = document.getElementById('ask-question-send') as HTMLButtonElement;

let currentResult: AnalysisResult | null = null;
let currentStream: ResultStreamState | null = null;
let askQuestionState: AskQuestionState = {
  questionText: '',
  submittedQuestionText: '',
  isQuestionComposerOpen: false,
  isSubmitting: false,
  hasCaptureContext: false
};
let resultOverflowEnabled = false;
let typingTimer: number | null = null;
let layoutReportFrame: number | null = null;
let displayedStreamText = '';
let targetStreamText = '';
let pendingAskQuestionFocus = false;

const VISIBLE_ACTIONS: QuickActionId[] = ['describe', 'code', 'translate', 'summarize'];

function applyOverflowState(): void {
  resultText.classList.toggle('is-scrollable', resultOverflowEnabled);
}

const ACTION_ICONS: Record<QuickActionId, string> = {
  describe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.85 5.15L19 10l-5.15 1.85L12 17l-1.85-5.15L5 10l5.15-1.85L12 3Z"/></svg>',
  extract: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12"/><path d="M6 12h12"/><path d="M6 17h8"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18-6-6 6-6"/><path d="m15 6 6 6-6 6"/></svg>',
  translate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h8"/><path d="M8 3v2"/><path d="M6 13l4-8 4 8"/><path d="M5 11h6"/><path d="M14 15h6"/><path d="M17 13v8"/><path d="m14 21 3-3 3 3"/></svg>',
  summarize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h12"/><path d="M4 17h8"/></svg>',
  ask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
  custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
};

function getActionDisplayLabel(actionId: QuickActionId | null): string {
  if (!actionId || actionId === 'describe') {
    return 'AI Overview';
  }

  return QUICK_ACTIONS.find((action) => action.id === actionId)?.label ?? 'Custom';
}

function stripInlineMarkdown(input: string): string {
  return input
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/, '')
    .trim();
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line) || (/^[A-Za-z][A-Za-z0-9\s/&()'-]{1,60}:$/.test(line) && line.length < 64);
}

function isNumberedListLine(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function isBulletListLine(line: string): boolean {
  return /^[-*•]\s+/.test(line);
}

function appendParagraph(container: HTMLElement, text: string): void {
  const paragraph = document.createElement('p');
  paragraph.textContent = stripInlineMarkdown(text);
  container.appendChild(paragraph);
}

function appendHeading(container: HTMLElement, text: string): void {
  const heading = document.createElement('h3');
  heading.textContent = stripInlineMarkdown(text.replace(/^#{1,6}\s+/, '').replace(/:$/, ''));
  container.appendChild(heading);
}

function appendList(container: HTMLElement, items: string[], ordered: boolean): void {
  const list = document.createElement(ordered ? 'ol' : 'ul');
  items.forEach((item) => {
    const listItem = document.createElement('li');
    listItem.textContent = stripInlineMarkdown(item);
    list.appendChild(listItem);
  });
  container.appendChild(list);
}

function stopTypewriter(): void {
  if (typingTimer !== null) {
    window.clearTimeout(typingTimer);
    typingTimer = null;
  }
}

function getElementContentHeight(element: HTMLElement): number {
  const elementRect = element.getBoundingClientRect();
  const elementStyles = window.getComputedStyle(element);
  const borderHeight = parseFloat(elementStyles.borderTopWidth) + parseFloat(elementStyles.borderBottomWidth);
  let contentHeight = element.scrollHeight + borderHeight;

  Array.from(element.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) {
      return;
    }

    const childRect = child.getBoundingClientRect();
    const childStyles = window.getComputedStyle(child);
    const childBottom =
      childRect.bottom -
      elementRect.top +
      parseFloat(childStyles.marginBottom) +
      parseFloat(elementStyles.paddingBottom) +
      borderHeight;
    contentHeight = Math.max(contentHeight, childBottom);
  });

  return Math.ceil(contentHeight);
}

function scheduleLayoutHeightReport(): void {
  if (layoutReportFrame !== null) {
    return;
  }

  layoutReportFrame = window.requestAnimationFrame(() => {
    layoutReportFrame = null;

    const pageStyles = window.getComputedStyle(resultPage);
    const cardStyles = window.getComputedStyle(resultCard);
    const shellStyles = window.getComputedStyle(resultShell);
    const pagePadding = parseFloat(pageStyles.paddingTop) + parseFloat(pageStyles.paddingBottom);
    const cardPadding = parseFloat(cardStyles.paddingTop) + parseFloat(cardStyles.paddingBottom);
    const shellGap = parseFloat(shellStyles.rowGap || shellStyles.gap || '0');
    const questionHeight = askedQuestionDisplay.hidden ? 0 : askedQuestionDisplay.scrollHeight;
    const groundingHeight = groundingBadge.hidden ? 0 : groundingBadge.scrollHeight;
    const composerHeight = askQuestionComposer.hidden ? 0 : askQuestionComposer.scrollHeight;
    const sourcesHeight = sourcesSection.hidden ? 0 : sourcesSection.scrollHeight;
    const askEntryHeight = resultAskEntry.hidden ? 0 : resultAskEntry.scrollHeight;
    const sectionCount =
      2 +
      (askedQuestionDisplay.hidden ? 0 : 1) +
      (groundingBadge.hidden ? 0 : 1) +
      (askQuestionComposer.hidden ? 0 : 1) +
      (sourcesSection.hidden ? 0 : 1) +
      (resultAskEntry.hidden ? 0 : 1);
    const desiredHeight = Math.ceil(
      pagePadding +
        cardPadding +
        resultTopbar.getBoundingClientRect().height +
        questionHeight +
        groundingHeight +
        composerHeight +
        getElementContentHeight(resultText) +
        sourcesHeight +
        askEntryHeight +
        shellGap * Math.max(0, sectionCount - 1) +
        2
    );

    window.desktopAssistant.reportResultLayoutHeight(desiredHeight);
  });
}

function isWaitingForFirstToken(stream: ResultStreamState | null): boolean {
  return Boolean(
    stream &&
      stream.status !== 'error' &&
      !stream.text.trim() &&
      (stream.webSearchInProgress || stream.status === 'loading')
  );
}

function setSearchingBadgeVisible(visible: boolean): void {
  searchingBadge.hidden = !visible;
  quickActions.hidden = visible;
  if (visible) {
    groundingBadge.hidden = true;
  }
}

function clearGroundingInfo(): void {
  searchingBadge.hidden = true;
  quickActions.hidden = false;
  groundingBadge.hidden = true;
  askedQuestionDisplay.hidden = true;
  askedQuestionText.textContent = '';
  sourcesSection.hidden = true;
  sourcesList.innerHTML = '';
  resultAskEntry.hidden = true;
}

function setResultOverflowState(enabled: boolean): void {
  resultOverflowEnabled = enabled;
  applyOverflowState();
}

function renderGroundingInfo(groundingUsed: boolean, sources: SourceLink[]): void {
  searchingBadge.hidden = true;
  quickActions.hidden = false;
  groundingBadge.hidden = !groundingUsed;

  sourcesList.innerHTML = '';
  if (!sources.length) {
    sourcesSection.hidden = true;
    scheduleLayoutHeightReport();
    return;
  }

  sourcesSection.hidden = false;

  sources.forEach((source) => {
    const item = document.createElement('li');
    item.className = 'result-source-item';

    const link = document.createElement('a');
    link.href = source.url;
    link.className = 'result-source-link';
    link.textContent = source.title;
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await window.desktopAssistant.openExternalLink(source.url);
    });

    const normalizedTitle = source.title.trim().toLowerCase();
    const normalizedHost = source.host.trim().toLowerCase();

    item.appendChild(link);
    if (normalizedHost && normalizedHost !== normalizedTitle) {
      const host = document.createElement('span');
      host.className = 'result-source-host';
      host.textContent = source.host;
      item.appendChild(host);
    }
    sourcesList.appendChild(item);
  });

  scheduleLayoutHeightReport();
}

function renderSubmittedQuestion(): void {
  const activeQuickActionId = currentStream?.quickActionId ?? currentResult?.quickActionId ?? null;
  const questionText = askQuestionState.submittedQuestionText.trim();
  const shouldShow = Boolean(activeQuickActionId === 'ask' && questionText && !askQuestionState.isQuestionComposerOpen);

  askedQuestionDisplay.hidden = !shouldShow;
  askedQuestionText.textContent = shouldShow ? questionText : '';
  scheduleLayoutHeightReport();
}

function renderAskEntry(): void {
  const shouldShow = Boolean(currentResult && askQuestionState.hasCaptureContext && !askQuestionState.isQuestionComposerOpen && !currentStream);
  resultAskEntry.hidden = !shouldShow;
  resultAskEntry.disabled = !shouldShow;
  scheduleLayoutHeightReport();
}

function renderStreamBody(): void {
  resultText.innerHTML = '';
  resultText.style.whiteSpace = 'pre-wrap';
  resultText.classList.add('is-streaming');
  applyOverflowState();

  if (isWaitingForFirstToken(currentStream)) {
    scheduleLayoutHeightReport();
    return;
  }

  const suffix = currentStream && currentStream.status !== 'error' ? '▍' : '';
  const streamCopy = document.createElement('p');
  streamCopy.textContent = `${displayedStreamText}${suffix}`;
  resultText.appendChild(streamCopy);
  scheduleLayoutHeightReport();
}

function tickTypewriter(): void {
  typingTimer = null;
  if (!currentStream) {
    return;
  }

  const remaining = targetStreamText.length - displayedStreamText.length;
  if (remaining > 0) {
    const step = Math.max(1, Math.min(8, Math.ceil(remaining / 18)));
    displayedStreamText = targetStreamText.slice(0, displayedStreamText.length + step);
    renderStreamBody();
    typingTimer = window.setTimeout(tickTypewriter, 16);
    return;
  }

  renderStreamBody();
}

function scheduleTypewriter(): void {
  if (typingTimer !== null) {
    return;
  }

  typingTimer = window.setTimeout(tickTypewriter, 16);
}

function getActiveQuickActionId(): QuickActionId {
  if (askQuestionState.isQuestionComposerOpen) {
    return 'ask';
  }

  return currentStream?.quickActionId ?? currentResult?.quickActionId ?? 'describe';
}

function maybeFocusAskQuestionInput(): void {
  if (!pendingAskQuestionFocus || askQuestionComposer.hidden || askQuestionState.isSubmitting) {
    return;
  }

  pendingAskQuestionFocus = false;
  window.requestAnimationFrame(() => {
    askQuestionInput.focus();
    const caretPosition = askQuestionInput.value.length;
    askQuestionInput.setSelectionRange(caretPosition, caretPosition);
  });
}

function renderAskQuestionComposer(): void {
  const shouldShow = getActiveQuickActionId() === 'ask' && askQuestionState.isQuestionComposerOpen && askQuestionState.hasCaptureContext;
  askQuestionComposer.hidden = !shouldShow;
  resultCard.classList.toggle('has-ask-composer', shouldShow);

  if (askQuestionInput.value !== askQuestionState.questionText) {
    askQuestionInput.value = askQuestionState.questionText;
  }

  askQuestionInput.disabled = askQuestionState.isSubmitting;
  askQuestionClose.disabled = askQuestionState.isSubmitting;
  askQuestionSend.disabled = askQuestionState.isSubmitting || !askQuestionState.questionText.trim();
  askQuestionHelper.textContent = askQuestionState.isSubmitting
    ? 'Xerolas is answering based on this capture…'
    : 'Press Enter to send, Shift+Enter for a new line.';

  maybeFocusAskQuestionInput();
  scheduleLayoutHeightReport();
}

function renderQuickActions(activeQuickActionId: QuickActionId | null): void {
  quickActions.innerHTML = '';

  VISIBLE_ACTIONS.forEach((actionId) => {
    const action = QUICK_ACTIONS.find((entry) => entry.id === actionId);
    if (!action) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `result-mini-action${action.id === activeQuickActionId ? ' is-active' : ''}`;
    button.setAttribute('aria-pressed', action.id === activeQuickActionId ? 'true' : 'false');
    button.setAttribute('aria-label', getActionDisplayLabel(action.id));
    button.title = getActionDisplayLabel(action.id);
    button.innerHTML = ACTION_ICONS[action.id];
    button.disabled = Boolean(currentStream);
    button.addEventListener('click', async () => {
      if (action.id === 'ask') {
        if (askQuestionState.hasCaptureContext || currentResult || currentStream) {
          await window.desktopAssistant.openAskQuestionComposer();
          return;
        }

        await window.desktopAssistant.requestCapture(action.id);
        return;
      }

      if (currentResult || askQuestionState.hasCaptureContext) {
        await window.desktopAssistant.rerunResult(action.id);
        return;
      }

      await window.desktopAssistant.requestCapture(action.id);
    });
    quickActions.appendChild(button);
  });
}

function renderStructuredText(text: string): void {
  stopTypewriter();
  displayedStreamText = '';
  targetStreamText = '';
  resultText.innerHTML = '';
  resultText.style.whiteSpace = '';
  resultText.classList.remove('is-streaming');
  applyOverflowState();
  const lines = text.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? '';

    if (!current) {
      index += 1;
      continue;
    }

    if (isHeadingLine(current)) {
      appendHeading(resultText, current);
      index += 1;
      continue;
    }

    if (isNumberedListLine(current)) {
      const items: string[] = [];
      while (index < lines.length && isNumberedListLine(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      appendList(resultText, items, true);
      continue;
    }

    if (isBulletListLine(current)) {
      const items: string[] = [];
      while (index < lines.length && isBulletListLine(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*•]\s+/, ''));
        index += 1;
      }
      appendList(resultText, items, false);
      continue;
    }

    const paragraphLines = [current];
    index += 1;

    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next) {
        index += 1;
        break;
      }

      if (isHeadingLine(next) || isNumberedListLine(next) || isBulletListLine(next)) {
        break;
      }

      paragraphLines.push(next);
      index += 1;
    }

    appendParagraph(resultText, paragraphLines.join(' '));
  }

  if (!resultText.childElementCount) {
    appendParagraph(resultText, text);
  }

  scheduleLayoutHeightReport();
}

function renderResult(result: AnalysisResult): void {
  currentResult = result;
  currentStream = null;
  renderQuickActions(getActiveQuickActionId());
  renderAskQuestionComposer();
  renderSubmittedQuestion();
  renderStructuredText(result.text);
  renderGroundingInfo(result.groundingUsed, result.sources);
  renderAskEntry();
}

function renderStreamState(state: ResultStreamState): void {
  currentStream = state;
  clearGroundingInfo();
  setSearchingBadgeVisible(isWaitingForFirstToken(state));
  renderQuickActions(getActiveQuickActionId());
  renderAskQuestionComposer();
  renderSubmittedQuestion();
  renderAskEntry();
  targetStreamText = state.text;
  if (displayedStreamText.length > targetStreamText.length) {
    displayedStreamText = targetStreamText;
  }
  renderStreamBody();
  scheduleTypewriter();
}

function renderEmptyState(): void {
  currentResult = null;
  currentStream = null;
  stopTypewriter();
  displayedStreamText = '';
  targetStreamText = '';
  resultText.innerHTML = '';
  resultText.style.whiteSpace = '';
  resultText.classList.remove('is-streaming');
  clearGroundingInfo();
  renderSubmittedQuestion();
  appendParagraph(
    resultText,
    getActiveQuickActionId() === 'ask' && askQuestionState.hasCaptureContext
      ? 'Ask a question about this capture and Xerolas will answer from the selected region.'
      : 'Capture any part of your screen and Xerolas will show the answer here.'
  );
  renderQuickActions(getActiveQuickActionId());
  renderAskQuestionComposer();
  renderAskEntry();
  scheduleLayoutHeightReport();
}

async function submitAskQuestion(): Promise<void> {
  const questionText = askQuestionInput.value;
  if (!questionText.trim()) {
    return;
  }

  await window.desktopAssistant.submitAskQuestion(questionText);
}

askQuestionInput.addEventListener('input', () => {
  void window.desktopAssistant.updateAskQuestionDraft(askQuestionInput.value).catch(console.error);
});

askQuestionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void submitAskQuestion().catch(console.error);
  }
});

askQuestionSend.addEventListener('click', () => {
  void submitAskQuestion().catch(console.error);
});

askQuestionClose.addEventListener('click', () => {
  void window.desktopAssistant.closeAskQuestionComposer().catch(console.error);
});

resultAskEntry.addEventListener('click', () => {
  void window.desktopAssistant.openAskQuestionComposer().catch(console.error);
});

window.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    await window.desktopAssistant.collapseResult();
  }
});

window.desktopAssistant.onResultOverflowEnabled((enabled) => {
  setResultOverflowState(enabled);
  scheduleLayoutHeightReport();
});

window.desktopAssistant.onAskQuestionState((state) => {
  const shouldFocus = state.isQuestionComposerOpen && !askQuestionState.isQuestionComposerOpen;
  askQuestionState = state;
  if (shouldFocus && !state.isSubmitting) {
    pendingAskQuestionFocus = true;
  }

  if (currentStream) {
    renderQuickActions(getActiveQuickActionId());
    renderAskQuestionComposer();
    renderSubmittedQuestion();
    renderAskEntry();
    return;
  }

  if (currentResult) {
    renderQuickActions(getActiveQuickActionId());
    renderAskQuestionComposer();
    renderSubmittedQuestion();
    renderAskEntry();
    scheduleLayoutHeightReport();
    return;
  }

  renderEmptyState();
});

window.desktopAssistant.onResult((result) => {
  currentResult = result;
  if (currentStream) {
    return;
  }

  if (result) {
    renderResult(result);
    return;
  }

  renderEmptyState();
});
window.desktopAssistant.onResultStream((streamState) => {
  if (streamState) {
    renderStreamState(streamState);
    return;
  }

  currentStream = null;
  if (currentResult) {
    renderResult(currentResult);
    return;
  }

  renderEmptyState();
});

Promise.all([
  window.desktopAssistant.getResult(),
  window.desktopAssistant.getResultStream(),
  window.desktopAssistant.getResultOverflowEnabled(),
  window.desktopAssistant.getAskQuestionState()
])
  .then(([result, streamState, overflowEnabled, initialAskQuestionState]) => {
    setResultOverflowState(overflowEnabled);
    currentResult = result;
    askQuestionState = initialAskQuestionState;

    if (streamState) {
      renderStreamState(streamState);
    } else if (result) {
      renderResult(result);
    } else {
      renderEmptyState();
    }
  })
  .catch(console.error);
