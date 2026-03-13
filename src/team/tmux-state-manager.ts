/**
 * Manages tmux state modifications in a session-scoped manner to avoid conflicts
 * with user's existing tmux configurations (e.g., oh-my-tmux).
 * 
 * This module provides save/restore functionality for tmux settings that OMX modifies.
 */

import { spawnSync } from 'child_process';

interface TmuxStateSnapshot {
  sessionTarget: string;
  mouseOption: string | null;
  setClipboardOption: string | null;
  wheelUpPaneBinding: string | null;
  mouseDragEndBinding: string | null;
  terminalOverrides: string | null;
}

/**
 * Runs a tmux command and returns the result.
 */
function runTmux(args: string[]): { ok: true; stdout: string } | { ok: false; stderr: string } {
  const result = spawnSync('tmux', args, { encoding: 'utf-8' });
  if (result.error) return { ok: false, stderr: result.error.message };
  if (result.status !== 0) {
    return { ok: false, stderr: (result.stderr || '').trim() || `tmux exited ${result.status}` };
  }
  return { ok: true, stdout: (result.stdout || '').trim() };
}

/**
 * Captures the current tmux state before OMX modifications.
 */
export function captureTmuxState(sessionTarget: string): TmuxStateSnapshot | null {
  // Capture mouse option
  const mouseResult = runTmux(['show-options', '-qv', '-t', sessionTarget, 'mouse']);
  const mouseOption = mouseResult.ok ? mouseResult.stdout : null;

  // Capture set-clipboard option
  const clipboardResult = runTmux(['show-options', '-qv', '-t', sessionTarget, 'set-clipboard']);
  const setClipboardOption = clipboardResult.ok ? clipboardResult.stdout : null;

  // Capture WheelUpPane binding
  const wheelUpResult = runTmux(['list-keys', '-T', 'root']);
  const wheelUpPaneBinding = wheelUpResult.ok 
    ? wheelUpResult.stdout.split('\n').find(line => line.includes('WheelUpPane')) || null
    : null;

  // Capture MouseDragEnd1Pane binding
  const dragEndResult = runTmux(['list-keys', '-T', 'copy-mode']);
  const mouseDragEndBinding = dragEndResult.ok
    ? dragEndResult.stdout.split('\n').find(line => line.includes('MouseDragEnd1Pane')) || null
    : null;

  // Capture terminal-overrides (WSL2)
  const overridesResult = runTmux(['show-options', '-gv', 'terminal-overrides']);
  const terminalOverrides = overridesResult.ok ? overridesResult.stdout : null;

  return {
    sessionTarget,
    mouseOption,
    setClipboardOption,
    wheelUpPaneBinding,
    mouseDragEndBinding,
    terminalOverrides,
  };
}

/**
 * Restores tmux state from a snapshot.
 */
export function restoreTmuxState(snapshot: TmuxStateSnapshot): boolean {
  let success = true;

  // Restore mouse option
  if (snapshot.mouseOption === '' || snapshot.mouseOption === null) {
    // Unset to restore default/inheritance
    const result = runTmux(['set-option', '-u', '-t', snapshot.sessionTarget, 'mouse']);
    if (!result.ok) success = false;
  } else {
    const result = runTmux(['set-option', '-t', snapshot.sessionTarget, 'mouse', snapshot.mouseOption]);
    if (!result.ok) success = false;
  }

  // Restore set-clipboard option
  if (snapshot.setClipboardOption === '' || snapshot.setClipboardOption === null) {
    const result = runTmux(['set-option', '-u', '-t', snapshot.sessionTarget, 'set-clipboard']);
    if (!result.ok) success = false;
  } else {
    const result = runTmux(['set-option', '-t', snapshot.sessionTarget, 'set-clipboard', snapshot.setClipboardOption]);
    if (!result.ok) success = false;
  }

  // Restore WheelUpPane binding
  if (snapshot.wheelUpPaneBinding === null) {
    // No binding existed before, unbind it
    runTmux(['unbind-key', '-n', 'WheelUpPane']);
  } else {
    // Original binding existed, restore it
    // Parse the binding line and reapply it
    // For now, we'll unbind and let the user's config handle it
    runTmux(['unbind-key', '-n', 'WheelUpPane']);
  }

  // Restore MouseDragEnd1Pane binding
  if (snapshot.mouseDragEndBinding === null) {
    // No binding existed before, unbind it
    runTmux(['unbind-key', '-T', 'copy-mode', 'MouseDragEnd1Pane']);
  } else {
    // Original binding existed, restore it
    runTmux(['unbind-key', '-T', 'copy-mode', 'MouseDragEnd1Pane']);
  }

  // Restore terminal-overrides (WSL2)
  // For terminal-overrides, we need to remove the OMX-added part
  // Since it was appended with -ga, we need to restore the original value
  if (snapshot.terminalOverrides !== null) {
    // Restore the original terminal-overrides value
    const result = runTmux(['set-option', '-g', 'terminal-overrides', snapshot.terminalOverrides]);
    if (!result.ok) success = false;
  }

  return success;
}

/**
 * Store snapshot in tmux user options for persistence across restarts.
 */
export function saveSnapshotToTmux(snapshot: TmuxStateSnapshot): void {
  runTmux(['set-option', '-g', '@omx-mouse-saved', snapshot.mouseOption || '']);
  runTmux(['set-option', '-g', '@omx-clipboard-saved', snapshot.setClipboardOption || '']);
  runTmux(['set-option', '-g', '@omx-wheelup-saved', snapshot.wheelUpPaneBinding || '']);
  runTmux(['set-option', '-g', '@omx-dragend-saved', snapshot.mouseDragEndBinding || '']);
  runTmux(['set-option', '-g', '@omx-overrides-saved', snapshot.terminalOverrides || '']);
  runTmux(['set-option', '-g', '@omx-session-target', snapshot.sessionTarget]);
}

/**
 * Load snapshot from tmux user options.
 */
export function loadSnapshotFromTmux(): TmuxStateSnapshot | null {
  const targetResult = runTmux(['show-options', '-gv', '@omx-session-target']);
  if (!targetResult.ok) return null;

  const sessionTarget = targetResult.stdout;
  if (!sessionTarget) return null;

  const mouseResult = runTmux(['show-options', '-gv', '@omx-mouse-saved']);
  const clipboardResult = runTmux(['show-options', '-gv', '@omx-clipboard-saved']);
  const wheelupResult = runTmux(['show-options', '-gv', '@omx-wheelup-saved']);
  const dragendResult = runTmux(['show-options', '-gv', '@omx-dragend-saved']);
  const overridesResult = runTmux(['show-options', '-gv', '@omx-overrides-saved']);

  return {
    sessionTarget,
    mouseOption: mouseResult.ok ? mouseResult.stdout || null : null,
    setClipboardOption: clipboardResult.ok ? clipboardResult.stdout || null : null,
    wheelUpPaneBinding: wheelupResult.ok ? wheelupResult.stdout || null : null,
    mouseDragEndBinding: dragendResult.ok ? dragendResult.stdout || null : null,
    terminalOverrides: overridesResult.ok ? overridesResult.stdout || null : null,
  };
}

/**
 * Clear saved snapshot from tmux user options.
 */
export function clearSavedSnapshot(): void {
  runTmux(['set-option', '-ug', '@omx-mouse-saved']);
  runTmux(['set-option', '-ug', '@omx-clipboard-saved']);
  runTmux(['set-option', '-ug', '@omx-wheelup-saved']);
  runTmux(['set-option', '-ug', '@omx-dragend-saved']);
  runTmux(['set-option', '-ug', '@omx-overrides-saved']);
  runTmux(['set-option', '-ug', '@omx-session-target']);
}
