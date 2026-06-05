// @vitest-environment jsdom
//
// Stage B of plugin-driven-flow-plan — Home intent tabs.
// Covers the simplified composer tab row: only Prototype is visible,
// while the underlying chip catalog still keeps route metadata for
// programmatic flows.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { HomeHero } from '../../src/components/HomeHero';
import {
  HOME_HERO_CHIPS,
  findChip,
} from '../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

function makePlugin(id: string, mode: string, title = id): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title,
      description: 'Plugin fixture',
      tags: [mode],
      od: { mode },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const onPickChip = vi.fn();
  const onPickPlugin = vi.fn();
  const onClearActiveChip = vi.fn();
  render(
    <HomeHero
      prompt=""
      onPromptChange={() => undefined}
      onSubmit={() => undefined}
      activePluginTitle={null}
      activeChipId={null}
      onClearActivePlugin={() => undefined}
      pluginOptions={[]}
      pluginsLoading={false}
      pendingPluginId={null}
      pendingChipId={null}
      onPickPlugin={onPickPlugin}
      onPickChip={onPickChip}
      onClearActiveChip={onClearActiveChip}
      contextItemCount={0}
      error={null}
      {...overrides}
    />,
  );
  return { onPickChip, onPickPlugin, onClearActiveChip };
}

describe('HomeHero intent rail', () => {
  it('renders only the Prototype composer tab', () => {
    renderHero();
    const tabs = screen.getByTestId('home-hero-type-tabs');
    const prototype = screen.getByTestId('home-hero-rail-prototype');
    expect(tabs.contains(prototype)).toBe(true);

    for (const chip of HOME_HERO_CHIPS) {
      if (chip.id === 'prototype') continue;
      expect(screen.queryByTestId(`home-hero-rail-${chip.id}`)).toBeNull();
    }
    expect(screen.queryByTestId('home-hero-shortcuts-trigger')).toBeNull();
  });

  it('forwards the Prototype chip descriptor when clicked', () => {
    const { onPickChip } = renderHero();
    fireEvent.click(screen.getByTestId('home-hero-rail-prototype'));
    expect(onPickChip).toHaveBeenCalledTimes(1);
    expect(onPickChip).toHaveBeenCalledWith(findChip('prototype'));
  });

  it('moves the active creation chip into the composer and hides the tab row', () => {
    renderHero({ activeChipId: 'video' });
    expect(screen.queryByTestId('home-hero-type-tabs')).toBeNull();
    expect(screen.queryByTestId('home-hero-rail-video')).toBeNull();
    const node = screen.getByTestId('home-hero-active-type-chip');
    expect(node.getAttribute('data-chip-id')).toBe('video');
    expect(node.textContent).toContain('Video');
  });

  it('lets the active creation chip be removed from the composer', () => {
    const { onClearActiveChip } = renderHero({ activeChipId: 'prototype' });
    fireEvent.click(screen.getByTestId('home-hero-active-type-chip'));
    expect(onClearActiveChip).toHaveBeenCalledTimes(1);
  });

  it('uses the active creation chip as the only clear control for a chip-bound plugin', () => {
    const activePlugin = makePlugin('example-image-a', 'image', 'Product image');
    renderHero({
      activeChipId: 'image',
      activePluginTitle: 'Product image',
      activePluginRecord: activePlugin,
      showActivePluginChip: true,
    });

    expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    expect(screen.getByTestId('home-hero-active-type-chip')).toBeTruthy();
    expect(screen.queryByLabelText('Clear active plugin')).toBeNull();
  });

  it('keeps the active plugin clear control when no creation chip is active', () => {
    const activePlugin = makePlugin('example-image-a', 'image', 'Product image');
    const onClearActivePlugin = vi.fn();
    renderHero({
      activeChipId: null,
      activePluginTitle: 'Product image',
      activePluginRecord: activePlugin,
      onClearActivePlugin,
      showActivePluginChip: true,
    });

    const clear = screen.getByLabelText('Clear active plugin');
    fireEvent.click(clear);

    expect(onClearActivePlugin).toHaveBeenCalledTimes(1);
  });

  it('does not render prompt examples or plugin presets below the composer', () => {
    renderHero({ activeChipId: 'prototype' });

    expect(screen.queryByTestId('home-hero-prompt-examples')).toBeNull();
    expect(screen.queryByTestId('home-hero-plugin-presets')).toBeNull();
    expect(screen.queryByTestId('home-hero-active-example')).toBeNull();
  });

  it('disables the visible Prototype chip while a plugin apply is in flight', () => {
    renderHero({ pendingPluginId: 'example-web-prototype', pendingChipId: 'prototype' });
    const node = screen.getByTestId('home-hero-rail-prototype');
    expect((node as HTMLButtonElement).disabled).toBe(true);
    expect(node.className).toContain('is-pending');
  });

  it('keeps the generic fallback in the free-form prompt instead of an Other chip', () => {
    renderHero();

    expect(findChip('other')).toBeUndefined();
    expect(screen.queryByTestId('home-hero-rail-other')).toBeNull();
  });

  it('migration chips carry the right action discriminator', () => {
    expect(findChip('create-plugin')?.action).toMatchObject({ kind: 'create-plugin' });
    expect(findChip('figma')?.action).toMatchObject({ kind: 'apply-figma-migration' });
    expect(findChip('folder')).toBeUndefined();
    expect(findChip('template')?.action).toMatchObject({ kind: 'open-template-picker' });
  });

  it('media chips route to od-media-generation with the matching project kind', () => {
    expect(findChip('image')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'image',
    });
    expect(findChip('video')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'video' });
    expect(findChip('audio')?.action).toMatchObject({ pluginId: 'od-media-generation', projectKind: 'audio' });
  });

  it('prototype and slide-deck chips route to their specialised bundled scenario plugin', () => {
    // Prototype now binds to web-prototype's seed template instead of
    // the generic od-new-generation router. Same for Slide deck →
    // simple-deck. See packages/contracts/src/plugins/scenario-defaults.ts
    // for the rationale (battle-tested seed + layouts + checklist).
    expect(findChip('prototype')?.action).toMatchObject({ pluginId: 'example-web-prototype', projectKind: 'prototype' });
    expect(findChip('deck')?.action).toMatchObject({ pluginId: 'example-simple-deck', projectKind: 'deck' });
  });

  it('specialised category chips route to their bundled scenario plugin', () => {
    // HyperFrames is the motion-graphics specialisation of Video,
    // surfaced as a separate chip so users can target it directly
    // instead of routing through the generic Video chip.
    expect(findChip('hyperframes')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-hyperframes',
      projectKind: 'video',
    });
    expect(findChip('live-artifact')?.action).toMatchObject({
      kind: 'apply-scenario',
      pluginId: 'example-live-artifact',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      },
    });
  });
});
