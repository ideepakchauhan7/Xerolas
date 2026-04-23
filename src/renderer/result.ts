import {
  QUICK_ACTIONS,
  type AnalysisResult,
  type QuickActionId,
  type ResultStreamState
} from '../shared/types';

const resultText = document.getElementById('result-text') as HTMLDivElement;
const quickActions = document.getElementById('quick-actions') as HTMLDivElement;

let currentResult: AnalysisResult | null = null;
let currentStream: ResultStreamState | null = null;
let typingTimer: number | null = null;
let displayedStreamText = '';
let targetStreamText = '';

const VISIBLE_ACTIONS: QuickActionId[] = ['describe', 'code', 'translate', 'summarize', 'ask'];

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

function renderStreamBody(): void {
  resultText.innerHTML = '';
  resultText.style.whiteSpace = 'pre-wrap';
  resultText.classList.add('is-streaming');

  const streamCopy = document.createElement('p');
  const suffix = currentStream && currentStream.status !== 'error' ? '▍' : '';
  streamCopy.textContent = `${displayedStreamText}${suffix}`;
  resultText.appendChild(streamCopy);
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
      if (currentResult) {
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
}

function renderResult(result: AnalysisResult): void {
  currentResult = result;
  currentStream = null;
  renderQuickActions(result.quickActionId);
  renderStructuredText(result.text);
}

function renderStreamState(state: ResultStreamState): void {
  currentStream = state;
  renderQuickActions(state.quickActionId);
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
  appendParagraph(resultText, 'Capture any part of your screen and Xerolas will show the answer here.');
  renderQuickActions('describe');
}

window.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    await window.desktopAssistant.collapseResult();
  }
});

window.desktopAssistant.onResult((result) => {
  currentResult = result;
  if (!currentStream) {
    renderResult(result);
  }
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

Promise.all([window.desktopAssistant.getResult(), window.desktopAssistant.getResultStream()])
  .then(([result, streamState]) => {
    currentResult = result;

    if (streamState) {
      renderStreamState(streamState);
    } else if (result) {
      renderResult(result);
    } else {
      renderEmptyState();
    }
  })
  .catch(console.error);
