// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  artifactFileNameFor,
  buildApiProjectContext,
  clearStreamingConversationMarker,
  finalizeActiveAssistantMessagesOnStop,
  findExistingArtifactProjectFile,
  resolveRetryTarget,
  resolveSucceededRunStatus,
  selectPrimaryProjectFile,
  shouldClearActiveRunRefs,
} from '../../src/components/ProjectView';
import type { Artifact, ChatMessage, ProjectFile } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const streamMessage = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();
const writeProjectTextFile = vi.fn();

const replayArtifact: Artifact = {
  identifier: 'real-daemon-smoke',
  artifactType: 'text/html',
  title: 'Real Daemon Smoke',
  html: '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>',
};

function artifactProjectFile(name: string, mtime: number): ProjectFile {
  return {
    artifactManifest: {
      entry: name,
      exports: ['html'],
      kind: 'html',
      metadata: {
        artifactType: 'text/html',
        identifier: 'real-daemon-smoke',
        inferred: false,
      },
      renderer: 'html',
      title: 'Real Daemon Smoke',
      version: 1,
    },
    kind: 'html',
    mime: 'text/html',
    mtime,
    name,
    size: 100,
  };
}

function projectFile(
  name: string,
  kind: ProjectFile['kind'],
  mtime: number,
  artifactManifest?: ProjectFile['artifactManifest'],
): ProjectFile {
  return {
    artifactManifest,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
    mtime,
    name,
    size: 100,
  };
}

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: (...args: unknown[]) => streamMessage(...args),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) => fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: (...args: unknown[]) => writeProjectTextFile(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

const chatPaneSpy = vi.fn();
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: Record<string, unknown>) => {
    chatPaneSpy(props);
    return null;
  },
}));

const fileWorkspaceSpy = vi.fn();
vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: (props: Record<string, unknown>) => {
    fileWorkspaceSpy(props);
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

async function waitForReadyChatPaneProps() {
  await waitFor(() => {
    expect(chatPaneSpy).toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
  });
  return chatPaneSpy.mock.calls.at(-1)?.[0] as {
    onSend?: (prompt: string, attachments: unknown[], comments: unknown[]) => Promise<void>;
    initialDraft?: string;
  };
}

describe('terminal replay artifact recovery', () => {
  it('only reuses existing artifacts created at or after the current run started', () => {
    const runCreatedAt = 1_000;
    const stale = artifactProjectFile('real-daemon-smoke.html', runCreatedAt - 1);
    const current = artifactProjectFile('real-daemon-smoke-2.html', runCreatedAt + 1);

    expect(findExistingArtifactProjectFile(replayArtifact, [stale], { minMtime: runCreatedAt }))
      .toBeNull();
    expect(findExistingArtifactProjectFile(replayArtifact, [stale, current], { minMtime: runCreatedAt }))
      .toBe(current);
  });
});

describe('selectPrimaryProjectFile', () => {
  it('prefers explicit primary manifests over newer renderable files', () => {
    const newer = projectFile('preview.html', 'html', 2_000);
    const primary = projectFile('index.html', 'html', 1_000, {
      entry: 'index.html',
      exports: ['html'],
      kind: 'html',
      primary: true,
      renderer: 'html',
      title: 'Index',
      version: 1,
    });

    expect(selectPrimaryProjectFile([newer, primary])).toBe(primary);
  });

  it('ignores sidecar manifest files when choosing a fallback', () => {
    const sidecar = projectFile('index.html.artifact.json', 'text', 2_000);
    const html = projectFile('index.html', 'html', 1_000);

    expect(selectPrimaryProjectFile([sidecar, html])).toBe(html);
  });
});

describe('artifactFileNameFor', () => {
  it('uses index.html for the first HTML artifact even when it has a specific title', () => {
    expect(artifactFileNameFor({
      identifier: 'video-surveillance-admin',
      artifactType: 'text/html',
      title: '视频安防平台后台管理',
      html: '<!doctype html><html><body></body></html>',
    })).toBe('index.html');
  });

  it('keeps explicit HTML artifact names for child pages after an HTML entry exists', () => {
    expect(artifactFileNameFor({
      identifier: 'login',
      artifactType: 'text/html',
      title: 'Login',
      html: '<!doctype html><html><body></body></html>',
    }, [projectFile('index.html', 'html', 1)])).toBe('login.html');
  });

  it('does not rename later generic HTML artifacts when an HTML entry already exists', () => {
    expect(artifactFileNameFor(
      {
        identifier: 'generated-html',
        artifactType: 'text/html',
        title: 'Generated HTML',
        html: '<!doctype html><html><body></body></html>',
      },
      [projectFile('index.html', 'html', 1)],
    )).toBe('generated-html.html');
  });
});

describe('buildApiProjectContext', () => {
  it('tells API mode to create index.html when the project has no files', async () => {
    const context = await buildApiProjectContext({
      activeFileName: null,
      projectFiles: [],
      readProjectHtml: vi.fn(),
    });

    expect(context).toContain('No project files are present yet');
    expect(context).toContain('create `index.html`');
    expect(context).toContain('`index.html` must be a lightweight launcher/table of contents');
    expect(context).toContain('put real screen content in child files and shared CSS/JS');
    expect(context).toContain('Do not put overview/KPI boards, dashboards, charts, filters, tables, or topbar business actions in `index.html`');
    expect(context).toContain('create a child file such as `overview.html` or `dashboard.html`');
    expect(context).toContain('<a href="devices.html">设备管理</a>');
    expect(context).toContain('do not add target="_blank" to internal project HTML links');
    expect(context).toContain('do not build index navigation with onclick/data-page/hash routers');
    expect(context).toContain('All visible interactive controls must work in the preview');
    expect(context).toContain('Do not emit href="#", javascript:void(0), undefined inline handlers');
  });

  it('includes compact active HTML and incremental edit rules for existing projects', async () => {
    const context = await buildApiProjectContext({
      activeFileName: 'index.html',
      projectFiles: [
        projectFile('index.html', 'html', 1),
        projectFile('login.html', 'html', 2),
        projectFile('index.html.artifact.json', 'text', 3),
      ],
      readProjectHtml: vi.fn(async () => '<!doctype html><html><body><h1>Original app</h1></body></html>'),
    });

    expect(context).toContain('For small changes, preserve all existing files');
    expect(context).toContain('output only the affected file(s)');
    expect(context).toContain('omitted files remain unchanged on disk');
    expect(context).toContain('`index.html` is navigation glue for multi-page prototypes');
    expect(context).toContain('overview/KPI boards, dashboards, charts, filters, tables');
    expect(context).toContain('create it as a child file such as `overview.html` or `dashboard.html`');
    expect(context).toContain('Index launcher links must be real same-frame anchors');
    expect(context).toContain('internal navigation must replace the preview frame');
    expect(context).toContain('Do not use onclick, data-page, switchPage()');
    expect(context).toContain('For follow-up page changes, edit the relevant child HTML/CSS file');
    expect(context).toContain('update `index.html` only to add the new link');
    expect(context).toContain('If a menu click is broken, fix the `href` in `index.html`');
    expect(context).toContain('For global shell controls shared with sidebar/topbar/header');
    expect(context).toContain('update every child HTML file that renders that shell');
    expect(context).toContain('Do not add shell-level controls only to `index.html` or only to the active page');
    expect(context).toContain('For any interaction fix, make the clicked control executable rather than decorative');
    expect(context).toContain('visible state changes actually happen');
    expect(context).toContain('toast-only fake actions');
    expect(context).toContain('login.html must load or define its submit handler');
    expect(context).toContain('auth persistence must catch storage errors');
    expect(context).toContain('fallback such as URL `?auth=1` or `window.name`');
    expect(context).toContain('preserve unrelated markup, styles, scripts, and layout');
    expect(context).toContain('Files: index.html, login.html');
    expect(context).toContain('Active file: index.html');
    expect(context).toContain('<h1>Original app</h1>');
    expect(context).not.toContain('index.html.artifact.json');
  });

  it('includes index.html context when another HTML file is active', async () => {
    const readProjectHtml = vi.fn(async (name: string) => (
      name === 'login.html'
        ? '<!doctype html><html><body><form>Login</form></body></html>'
        : '<!doctype html><html><body><main>Original dashboard</main></body></html>'
    ));
    const context = await buildApiProjectContext({
      activeFileName: 'login.html',
      projectFiles: [
        projectFile('index.html', 'html', 1),
        projectFile('login.html', 'html', 2),
      ],
      readProjectHtml,
    });

    expect(readProjectHtml).toHaveBeenCalledWith('login.html');
    expect(readProjectHtml).toHaveBeenCalledWith('index.html');
    expect(context).toContain('Current active HTML source (login.html');
    expect(context).toContain('Current entry HTML source (index.html');
    expect(context).toContain('<main>Original dashboard</main>');
  });

  it('truncates long active HTML source in API project context', async () => {
    const context = await buildApiProjectContext({
      activeFileName: 'index.html',
      projectFiles: [projectFile('index.html', 'html', 1)],
      readProjectHtml: vi.fn(async () => `<!doctype html>${'x'.repeat(25_000)}`),
    });

    expect(context).toContain('[Open Design truncated');
    expect(context.length).toBeLessThan(25_000);
  });
});

describe('retry target resolution', () => {
  const userMessage: ChatMessage = {
    id: 'user-1',
    role: 'user',
    content: 'Create a login page',
    createdAt: 1,
  };
  const failedAssistant: ChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Generation failed',
    createdAt: 2,
    runStatus: 'failed',
  };

  it('returns the prior transcript and original user turn for the last failed assistant', () => {
    const systemContext: ChatMessage = {
      id: 'assistant-0',
      role: 'assistant',
      content: 'Earlier result',
      createdAt: 0,
      runStatus: 'succeeded',
    };

    expect(resolveRetryTarget([systemContext, userMessage, failedAssistant], failedAssistant.id)).toEqual({
      failedAssistant,
      userMsg: userMessage,
      priorMessages: [systemContext],
    });
  });

  it('rejects non-terminal, non-last, or non-user-preceded retry targets', () => {
    expect(resolveRetryTarget([userMessage, { ...failedAssistant, runStatus: 'running' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([userMessage, failedAssistant, { ...userMessage, id: 'user-2' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([failedAssistant], failedAssistant.id)).toBeNull();
  });
});

describe('ProjectView daemon cleanup', () => {
  beforeEach(() => {
    listProjectRuns.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('does not abort daemon cancel reattach controllers during unmount cleanup', async () => {
    let seenCancelSignal: { aborted: boolean } | null = null;
    let seenSignal: { aborted: boolean } | null = null;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'working',
        createdAt: Date.now(),
        runId: 'run-1',
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: { signal: { aborted: boolean }; cancelSignal?: { aborted: boolean } }) => {
      seenSignal = options.signal;
      seenCancelSignal = options.cancelSignal ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(seenSignal).not.toBeNull();
    expect(seenCancelSignal).not.toBeNull();

    view.unmount();

    if (!seenSignal || !seenCancelSignal) throw new Error('Expected reattach signals to be captured');
    expect((seenSignal as any).aborted).toBe(true);
    expect((seenCancelSignal as any).aborted).toBe(false);
  });

  it('marks successful daemon completion as succeeded even before runId reaches message state', () => {
    expect(resolveSucceededRunStatus('running')).toBe('succeeded');
    expect(resolveSucceededRunStatus('queued')).toBe('succeeded');
    expect(resolveSucceededRunStatus(undefined)).toBe('succeeded');
    expect(resolveSucceededRunStatus('failed')).toBe('failed');
    expect(resolveSucceededRunStatus('canceled')).toBe('canceled');
  });

  // Regression: a phantom 'running' row in DB (no runId, no matching active
  // daemon run) used to stick the UI on "Waiting for first output —
  // Working 24m+" forever. The reattach loop now self-heals by marking
  // such a message as failed so the composer is interactive again.
  //
  // TODO(reconcile): re-add the three unit tests for
  // finalizeActiveAssistantMessagesOnStop / clearStreamingConversationMarker /
  // shouldClearActiveRunRefs that landed on main alongside this hunk —
  // they were dropped at merge because their bodies sat on top of HEAD's
  // self-heals fixture and the test body that follows uses the
  // `startedAt` variable declared only in this `it()` opener.
  it('self-heals running messages with no runId when daemon has no active run', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-phantom',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(listActiveChatRuns).toHaveBeenCalled());
    await waitFor(() => {
      const failedCall = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.id === 'msg-phantom' && call[2]?.runStatus === 'failed',
      );
      expect(failedCall).toBeTruthy();
    });
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('persists a delayed daemon run id after switching projects so returning can reattach', async () => {
    const projectOne = { id: 'project-1', name: 'Project One', skillId: null, designSystemId: null };
    const projectTwo = { id: 'project-2', name: 'Project Two', skillId: null, designSystemId: null };
    const messagesByConversation = new Map<string, ChatMessage[]>([
      ['conv-1', []],
      ['conv-2', []],
    ]);

    listConversations.mockImplementation(async (projectId: string) => [
      projectId === 'project-1'
        ? { id: 'conv-1', title: 'Conversation 1' }
        : { id: 'conv-2', title: 'Conversation 2' },
    ]);
    listMessages.mockImplementation(async (_projectId: string, conversationId: string) =>
      messagesByConversation.get(conversationId) ?? [],
    );
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-delayed',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
      exitCode: null,
      signal: null,
    });
    saveMessage.mockImplementation(async (_projectId: string, conversationId: string, message: ChatMessage) => {
      const existing = messagesByConversation.get(conversationId) ?? [];
      const next = existing.filter((item) => item.id !== message.id);
      next.push(message);
      messagesByConversation.set(conversationId, next);
      return message;
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    let capturedRunCreated: ((runId: string) => void) | null = null;
    let capturedStreamSignal: AbortSignal | null = null;
    let capturedCancelSignal: AbortSignal | null = null;
    let capturedAssistantMessageId: string | null = null;
    streamViaDaemon.mockImplementation(async (options: {
      assistantMessageId?: string;
      signal: AbortSignal;
      cancelSignal?: AbortSignal;
      onRunCreated?: (runId: string) => void;
    }) => {
      capturedRunCreated = options.onRunCreated ?? null;
      capturedStreamSignal = options.signal;
      capturedCancelSignal = options.cancelSignal ?? null;
      capturedAssistantMessageId = options.assistantMessageId ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
      <ProjectView
        project={projectOne as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(capturedRunCreated).not.toBeNull();

    view.rerender(
      <ProjectView
        project={projectTwo as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect((capturedStreamSignal as AbortSignal | null)?.aborted).toBe(true));
    expect((capturedCancelSignal as AbortSignal | null)?.aborted).toBe(false);

    capturedRunCreated!('run-delayed');

    await waitFor(() => {
      const persistedAssistant = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-1' &&
          call[1] === 'conv-1' &&
          call[2]?.id === capturedAssistantMessageId &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-delayed' &&
          call[2]?.runStatus === 'queued',
      );
      expect(persistedAssistant).toBeTruthy();
    });

    view.rerender(
      <ProjectView
        project={projectOne as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(reattachDaemonRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-delayed' }),
      );
    });
  });

  // Regression: when a project is created via PluginLoopHome with the
  // auto-send sessionStorage flag set, ProjectView used to seed
  // ChatComposer.initialDraft with project.pendingPrompt. The composer
  // latched that seed into local state, then auto-send fired the same
  // text as a real user message — leaving the textarea populated while
  // the run streamed. The user reported "好像发送了输入框的 query 还
  // 没有清除". With the fix, auto-send projects must hand the composer
  // an undefined initialDraft so the textarea stays empty; the seed
  // still flows through autoSendSeedRef so the prompt is delivered.
  it('does not seed composer initialDraft when auto-send sessionStorage flag is set', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-2', '1');

    try {
      render(
        <ProjectView
          project={{
            id: 'project-2',
            name: 'Project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: 'design a landing page for a coffee shop',
          } as never}
          routeFileName={null}
          config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
          agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
          skills={[]}
        designTemplates={[]}
          designSystems={[]}
          daemonLive
          onModeChange={() => {}}
          onAgentChange={() => {}}
          onAgentModelChange={() => {}}
          onRefreshAgents={() => {}}
          onOpenSettings={() => {}}
          onBack={() => {}}
          onClearPendingPrompt={() => {}}
          onTouchProject={() => {}}
          onProjectChange={() => {}}
          onProjectsRefresh={() => {}}
        />,
      );

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      const seededCall = chatPaneSpy.mock.calls.find(
        (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
      );
      expect(seededCall).toBeUndefined();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-2');
    }
  });

  it('auto-sends Home-staged design files as first-turn daemon attachments', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-files', '1');
    window.sessionStorage.setItem(
      'od:auto-send-attachments:project-files',
      JSON.stringify([
        { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
        { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
      ]),
    );

    try {
      render(
        <ProjectView
          project={{
            id: 'project-files',
            name: 'Project',
            skillId: null,
            designSystemId: null,
          } as never}
          routeFileName={null}
          config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
          agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          daemonLive
          onModeChange={() => {}}
          onAgentChange={() => {}}
          onAgentModelChange={() => {}}
          onRefreshAgents={() => {}}
          onOpenSettings={() => {}}
          onBack={() => {}}
          onClearPendingPrompt={() => {}}
          onTouchProject={() => {}}
          onProjectChange={() => {}}
          onProjectsRefresh={() => {}}
        />,
      );

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
        attachments: ['brief.pdf', 'logo.png'],
        history: [
          expect.objectContaining({
            role: 'user',
            content: '',
            attachments: [
              { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
              { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
            ],
          }),
        ],
      });
      expect(window.sessionStorage.getItem('od:auto-send-first:project-files')).toBeNull();
      expect(window.sessionStorage.getItem('od:auto-send-attachments:project-files')).toBeNull();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-files');
      window.sessionStorage.removeItem('od:auto-send-attachments:project-files');
    }
  });

  it('queues board comment attachments while the current daemon run is still busy', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async () => new Promise<void>(() => {}));

    render(
      <ProjectView
        project={{
          id: 'project-comments',
          name: 'Project',
          skillId: null,
          designSystemId: null,
        } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const chatProps = await waitForReadyChatPaneProps();
    await chatProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(true);
    });

    const workspaceProps = fileWorkspaceSpy.mock.calls.at(-1)?.[0] as {
      onSendBoardCommentAttachments?: (attachments: unknown[]) => Promise<boolean | void>;
    };
    expect(workspaceProps.onSendBoardCommentAttachments).toBeTruthy();

    await workspaceProps.onSendBoardCommentAttachments!([
      {
        id: 'hero-board-1',
        order: 1,
        filePath: 'preview.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        comment: 'Use a warmer accent',
        currentText: 'Hero',
        pagePosition: { x: 10, y: 20, width: 100, height: 40 },
        htmlHint: '<main data-od-id="hero">',
        source: 'board-batch',
      },
    ]);

    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0] as {
        queuedItems?: Array<{ commentAttachments?: Array<{ comment: string }> }>;
      };
      expect(latest.queuedItems).toHaveLength(1);
      expect(latest.queuedItems?.[0]?.commentAttachments?.[0]?.comment).toBe('Use a warmer accent');
    });
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('audits design-system workspace output after first auto-send and seeds a bounded repair prompt', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'ui_kits/app/index.html must mount the kit.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    });
    let streamCallCount = 0;
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      streamCallCount += 1;
      options.onRunCreated?.(`run-ds-${streamCallCount}`);
      if (streamCallCount === 1) {
        options.handlers.onDone();
      }
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds',
          name: 'Cherry Studio Design System',
          skillId: null,
          designSystemId: 'user:cherry-studio',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:cherry-studio',
          },
        } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalled());
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds')).toBe('1');
    await waitFor(() => {
      const repairSeed = chatPaneSpy.mock.calls.find(
        (call) => typeof call[0]?.initialDraft === 'string'
          && call[0].initialDraft.includes('Fix the design-system package audit findings below.')
          && call[0].initialDraft.includes('ui_kit_index_missing_runtime_bootstrap'),
      );
      expect(repairSeed).toBeTruthy();
    });
    expect(saveMessage.mock.calls.some((call) =>
      call[2]?.role === 'assistant'
      && call[2]?.events?.some((event: { kind?: string; label?: string; detail?: string }) =>
        event.kind === 'status'
        && event.label === 'audit'
        && event.detail?.includes('Package audit found 1 error'),
      ),
    )).toBe(true);
  });

  it('clears design-system auto-repair budget when the first audit passes', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: true,
      projectPath: '/tmp/ds',
      filesInspected: 24,
      errors: [],
      warnings: [],
    });
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      options.onRunCreated?.('run-ds-pass');
      options.handlers.onDone();
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds-pass', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds-pass',
          name: 'Passing Design System',
          skillId: null,
          designSystemId: 'user:passing-ds',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:passing-ds',
          },
        } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds-pass'));
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds-pass')).toBeNull();
  });

  it('persists API multi-file artifacts into project files and opens the entry file', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-api', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    writeProjectTextFile.mockImplementation(
      async (_projectId: string, name: string, _content: string, options?: { artifactManifest?: unknown }) => ({
        artifactManifest: options?.artifactManifest,
        kind: /\.html?$/i.test(name) ? 'html' : 'text',
        mime: /\.html?$/i.test(name) ? 'text/html' : 'text/plain',
        mtime: Date.now(),
        name,
        size: 100,
      }),
    );

    const payload = {
      entry: 'index.html',
      files: [
        {
          name: 'index.html',
          content: '<!doctype html><html><head><title>Console</title></head><body><a href="login.html">Login</a></body></html>',
        },
        {
          name: 'login.html',
          content: '<!doctype html><html><head><title>Login</title></head><body><form><input name="phone"></form></body></html>',
        },
        {
          name: 'css/tokens.css',
          content: ':root { --accent: #2563eb; }',
        },
      ],
    };
    const artifactText =
      '<artifact identifier="video-security-console" type="application/vnd.open-design.files+json" title="视频安防后台">' +
      JSON.stringify(payload) +
      '</artifact>';
    streamMessage.mockImplementation(async (...args: unknown[]) => {
      const handlers = args[4] as {
        onDelta: (delta: string) => void;
        onDone: (fullText: string) => void;
      };
      handlers.onDelta(artifactText);
      handlers.onDone(artifactText);
    });

    chatPaneSpy.mockClear();
    fileWorkspaceSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-api-files', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{
          mode: 'api',
          apiProtocol: 'openai',
          apiKey: 'test-key',
          model: 'gpt-test',
          notifications: undefined,
          agentModels: {},
        } as never}
        agents={[]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps.onSend!('设计一个视频安防平台后台', [], []);

    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(3));

    expect(writeProjectTextFile).toHaveBeenCalledWith(
      'project-api-files',
      'index.html',
      expect.stringContaining('<!doctype html>'),
      expect.objectContaining({
        artifactManifest: expect.objectContaining({
          entry: 'index.html',
          kind: 'html',
          renderer: 'html',
          metadata: expect.objectContaining({
            artifactType: 'application/vnd.open-design.files+json',
            identifier: 'video-security-console',
            multiFileEntry: 'index.html',
          }),
        }),
      }),
    );
    expect(writeProjectTextFile).toHaveBeenCalledWith(
      'project-api-files',
      'login.html',
      expect.stringContaining('<form>'),
      expect.objectContaining({
        artifactManifest: expect.objectContaining({
          entry: 'login.html',
          kind: 'html',
        }),
      }),
    );
    expect(writeProjectTextFile).toHaveBeenCalledWith(
      'project-api-files',
      'css/tokens.css',
      ':root { --accent: #2563eb; }',
      expect.any(Object),
    );
    await waitFor(() => {
      expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0]?.openRequest?.name).toBe('index.html');
    });
  });

  it('persists API multi-file artifacts when the model emits a bracketed artifact tag', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-api-bracket', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([projectFile('index.html', 'html', 1)]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/memory/system-prompt')) {
        return new Response(JSON.stringify({ body: '' }), { status: 200 });
      }
      if (url.includes('/raw/index.html')) {
        return new Response(
          '<!doctype html><html><body><main id="existing-app">Original admin</main></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    writeProjectTextFile.mockImplementation(
      async (_projectId: string, name: string, _content: string, options?: { artifactManifest?: unknown }) => ({
        artifactManifest: options?.artifactManifest,
        kind: /\.html?$/i.test(name) ? 'html' : 'text',
        mime: /\.html?$/i.test(name) ? 'text/html' : 'text/plain',
        mtime: Date.now(),
        name,
        size: 100,
      }),
    );

    const payload = {
      entry: 'index.html',
      files: [
        {
          path: 'index.html',
          content: '<!doctype html><html><head><title>Admin</title></head><body><a href="login.html">Login</a></body></html>',
        },
        {
          path: 'login.html',
          content: '<!doctype html><html><head><title>Login</title></head><body><form><input name="phone"></form></body></html>',
        },
      ],
    };
    const artifactText =
      '[artifact type="application/vnd.open-design.files+json" identifier="video-surveillance-platform"]\n' +
      JSON.stringify(payload) +
      '\n</artifact>';
    streamMessage.mockImplementation(async (...args: unknown[]) => {
      const handlers = args[4] as {
        onDelta: (delta: string) => void;
        onDone: (fullText: string) => void;
      };
      handlers.onDelta(artifactText);
      handlers.onDone(artifactText);
    });

    chatPaneSpy.mockClear();
    fileWorkspaceSpy.mockClear();

    try {
      render(
        <ProjectView
          project={{ id: 'project-api-bracket-files', name: 'Project', skillId: null, designSystemId: null } as never}
          routeFileName={null}
          config={{
            mode: 'api',
            apiProtocol: 'openai',
            apiKey: 'test-key',
            model: 'gpt-test',
            notifications: undefined,
            agentModels: {},
          } as never}
          agents={[]}
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          daemonLive
          onModeChange={() => {}}
          onAgentChange={() => {}}
          onAgentModelChange={() => {}}
          onRefreshAgents={() => {}}
          onOpenSettings={() => {}}
          onBack={() => {}}
          onClearPendingPrompt={() => {}}
          onTouchProject={() => {}}
          onProjectChange={() => {}}
          onProjectsRefresh={() => {}}
        />,
      );

      const sendProps = await waitForReadyChatPaneProps();
      await sendProps.onSend!('加一个登录页并联动', [], []);

      await waitFor(() => expect(writeProjectTextFile).toHaveBeenCalledTimes(2));
      const systemPrompt = streamMessage.mock.calls.at(-1)?.[1] as string;
      expect(systemPrompt).toContain('## Current project files (API/BYOK compact context)');
      expect(systemPrompt).toContain('Files: index.html');
      expect(systemPrompt).toContain('include only files that must be created or changed');
      expect(systemPrompt).toContain('omitted files remain unchanged on disk');
      expect(writeProjectTextFile).toHaveBeenCalledWith(
        'project-api-bracket-files',
        'login.html',
        expect.stringContaining('<form>'),
        expect.objectContaining({
          artifactManifest: expect.objectContaining({ entry: 'login.html' }),
        }),
      );
      await waitFor(() => {
        expect(fileWorkspaceSpy.mock.calls.at(-1)?.[0]?.openRequest?.name).toBe('index.html');
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // Sister check: without the auto-send flag, the composer should still
  // seed from pendingPrompt so the user can edit before manually sending.
  it('seeds composer initialDraft with pendingPrompt when auto-send flag is absent', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    chatPaneSpy.mockClear();
    window.sessionStorage.removeItem('od:auto-send-first:project-3');

    render(
      <ProjectView
        project={{
          id: 'project-3',
          name: 'Project',
          skillId: null,
          designSystemId: null,
          pendingPrompt: 'design a landing page for a coffee shop',
        } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());
    // The first render — before activeConversationId resolves — must
    // pass the seed through so ChatComposer can populate its draft.
    const seedingCall = chatPaneSpy.mock.calls.find(
      (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
    );
    expect(seedingCall).toBeTruthy();
  });

  // Root-cause regression for the "Working 24m+ / Waiting for first output"
  // stuck UI. The phantom was created at line `persistMessage(assistantMsg)`
  // in handleSend: a daemon assistant row was written to DB with
  // runStatus='running' BEFORE POST /api/runs returned a runId. If that POST
  // never returned (slow daemon, network blip, component unmount mid-flight),
  // the row was orphaned forever with no runId for the reattach loop to
  // recover. The fix: persistMessage / persistMessageById / updateMessageById
  // all refuse to write a daemon assistant row that is still active without
  // a runId. The first DB write for that row only happens once onRunCreated
  // pins the daemon's runId onto the message.
  it('does not persist an assistant message before POST /api/runs returns a runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    // streamViaDaemon: capture onRunCreated but never resolve, so the POST
    // looks "in-flight" for the rest of the test. This is the exact window
    // in which phantom rows used to be written.
    let capturedOnRunCreated: ((runId: string) => void) | null = null;
    streamViaDaemon.mockImplementation(async (options: { onRunCreated?: (runId: string) => void }) => {
      capturedOnRunCreated = options.onRunCreated ?? null;
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-phantom', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    expect(sendProps?.onSend).toBeTypeOf('function');

    await sendProps!.onSend!('hello world', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    // The user message must be persisted immediately — it is committed
    // user intent and has no runId concept.
    const userSave = saveMessage.mock.calls.find((call) => call[2]?.role === 'user');
    expect(userSave?.[2]?.content).toBe('hello world');

    // The assistant placeholder must NOT be persisted yet: runStatus
    // is 'running' and the daemon has not returned a runId.
    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();

    // Now simulate POST /api/runs returning a runId. The assistant row
    // transitions to 'queued' with a runId — that's a non-phantom write
    // that the guard lets through.
    expect(capturedOnRunCreated).not.toBeNull();
    capturedOnRunCreated!('run-pinned-xyz');

    await waitFor(() => {
      const pinnedSave = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-pinned-xyz' &&
          call[2]?.runStatus === 'queued',
      );
      expect(pinnedSave).toBeTruthy();
    });
  });

  // Companion regression: if the user navigates away (component unmounts)
  // BEFORE onRunCreated ever fires, the assistant placeholder must never
  // appear in DB. This is the exact failure mode the user reported — the
  // PluginLoopHome auto-send fired, the user moved on, and a phantom row
  // sat forever in the project's conversation.
  it('never persists a phantom assistant row when send aborts before runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    streamViaDaemon.mockImplementation(async () => {
      // Simulate a POST that never returns (network blip, daemon timeout).
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    const view = render(
      <ProjectView
        project={{ id: 'project-aborted', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('quick send', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    view.unmount();

    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();
  });

  it('persists a daemon assistant row as failed after an AMR auth error returns post-run creation', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    }) => {
      options.onRunCreated?.('run-auth-expired');
      options.handlers.onError(
        new Error('Your authentication token has expired. Please sign in again.'),
      );
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-auth-expired', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('retry auth', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const failedAssistantSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-auth-expired' &&
          call[1] === 'conv-1' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-auth-expired' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.events?.some(
            (event: { kind?: string; label?: string; detail?: string }) =>
              event.kind === 'status' &&
              event.label === 'error' &&
              event.detail === 'Your authentication token has expired. Please sign in again.',
          ),
      );
      expect(failedAssistantSave).toBeTruthy();
    });
  });

  it('relinks terminal replay to an existing artifact without writing a duplicate file', async () => {
    const runCreatedAt = Date.now();
    const existingArtifact = {
      artifactManifest: {
        entry: 'real-daemon-smoke.html',
        exports: ['html'],
        kind: 'html',
        metadata: {
          artifactType: 'text/html',
          identifier: 'real-daemon-smoke',
          inferred: false,
        },
        renderer: 'html',
        title: 'Real Daemon Smoke',
        version: 1,
      },
      kind: 'html',
      mime: 'text/html',
      mtime: runCreatedAt + 1,
      name: 'real-daemon-smoke.html',
      size: 100,
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-replay',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        runId: 'run-replay',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([existingArtifact]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-replay',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(
        '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke"><h1>Real Daemon Smoke</h1></artifact>',
      );
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
        routeFileName={null}
        config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
        agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(saveMessage.mock.calls).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            'project-1',
            'conv-1',
            expect.objectContaining({
              id: 'msg-replay',
              producedFiles: [existingArtifact],
            }),
          ]),
        ]),
      );
    });
    expect(writeProjectTextFile).not.toHaveBeenCalled();
  });
});
