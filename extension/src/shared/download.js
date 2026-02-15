/**
 * FlowCapture - Download Manager
 * Gera intent estruturado e exporta em JSON/CSV/Markdown.
 */

import { CONFIG } from './constants.js';
import { TraceInterpreter } from './trace-interpreter.js';
import { WorkflowCompiler } from './workflow-compiler.js';

export class DownloadManager {
    static createIntent(url, steps) {
        const interpreter = new TraceInterpreter();
        const semanticAnalysis = interpreter.interpret(steps || [], url); // Pass URL

        return {
            url,
            semantic_analysis: semanticAnalysis,
            workflow: semanticAnalysis.workflow_steps, // Direct reference to new format
            intent_analysis: {
                summary: CONFIG.EXPORT.SUMMARY,
                version: CONFIG.EXPORT.VERSION,
                steps: steps || [],
                metadata: {
                    timestamp: Date.now(),
                    recordedAt: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    stepCount: (steps || []).length,
                    duration: this._calculateTotalDuration(steps)
                }
            }
        };
    }

    /**
     * Cria workflow IR compilado (formato screenshot-tool)
     * @param {string} url - URL inicial
     * @param {Array} capturedSteps - Steps capturados
     * @returns {Array} Workflow no formato IR
     */
    static createWorkflow(url, capturedSteps, options = {}) {
        const compiler = new WorkflowCompiler(options);
        const workflow = compiler.compile(url, capturedSteps);
        return workflow;
    }

    static _calculateTotalDuration(steps) {
        if (!steps || steps.length === 0) return 0;
        const first = steps[0];
        const last = steps[steps.length - 1];
        if (first.trigger?.timestamp && last.trigger?.timestamp) {
            return last.trigger.timestamp - first.trigger.timestamp;
        }
        return steps.reduce((total, s) => total + (s.duration_ms || 0), 0);
    }

    static downloadJSON(data, filename = null, indent = null) {
        try {
            const name = filename || CONFIG.EXPORT.FILE_NAME;
            const spaces = indent !== null ? indent : CONFIG.EXPORT.INDENT_SPACES;

            const json = JSON.stringify(data, null, spaces);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.style.display = 'none';

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            return true;
        } catch (error) {
            console.error('Download failed:', error);
            return false;
        }
    }

    static async downloadCurrentFlow(filename = null) {
        try {
            const recordedSteps = window.flowCapture?.recordedSteps || [];
            if (recordedSteps.length === 0) return false;

            const intent = this.createIntent(window.location.href, recordedSteps);
            return this.downloadJSON(intent, filename || this._generateFilename());
        } catch (error) {
            console.error('Failed to download current flow:', error);
            return false;
        }
    }

    static _generateFilename() {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        return `flow_capture_${date}_${time}.json`;
    }

    static _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static downloadText(text, filename, mimeType = 'text/plain;charset=utf-8') {
        try {
            const blob = new Blob([text], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            return true;
        } catch (error) {
            console.error('Text download failed:', error);
            return false;
        }
    }

    /**
     * CSV com a nova estrutura: visual_settling ao invés de visual_changes array
     */
    static downloadStepsAsCSV(steps, filename = 'flow_capture.csv') {
        try {
            const headers = [
                'Step ID', 'Type', 'Selector', 'Value',
                'Duration (ms)', 'Max Layout Shift', 'Stabilized',
                'New Elements', 'Class Toggles'
            ];

            const rows = steps.map(step => {
                const trigger = step.trigger || {};
                const settling = step.visual_settling || {};
                const effects = step.effects || {};

                return [
                    step.step_id || '',
                    trigger.type || '',
                    trigger.selector || '',
                    trigger.value || '',
                    step.duration_ms || 0,
                    settling.max_layout_shift || 0,
                    settling.stabilized ? 'yes' : 'no',
                    effects.new_elements?.length || 0,
                    effects.class_toggles?.length || 0
                ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
            });

            const csv = [headers.join(','), ...rows].join('\n');
            return this.downloadText(csv, filename, 'text/csv;charset=utf-8');
        } catch (error) {
            console.error('CSV download failed:', error);
            return false;
        }
    }

    /**
     * Markdown com visual_settling e effects
     */
    static downloadStepsAsMarkdown(steps, filename = 'flow_capture.md') {
        try {
            const lines = [
                '# FlowCapture - Recorded Flow',
                '',
                `**URL:** ${window.location.href}`,
                `**Steps:** ${steps.length}`,
                `**Date:** ${new Date().toLocaleString()}`,
                '',
                '## Steps',
                ''
            ];

            steps.forEach((step, index) => {
                const trigger = step.trigger || {};
                const settling = step.visual_settling || {};
                const effects = step.effects || {};

                lines.push(`### ${index + 1}. ${trigger.type || 'Unknown'}`);
                lines.push('');
                lines.push(`- **Selector:** \`${trigger.selector || 'N/A'}\``);

                if (trigger.value !== undefined) {
                    lines.push(`- **Value:** ${trigger.value}`);
                }

                lines.push(`- **Duration:** ${step.duration_ms || 0}ms`);

                if (settling.max_layout_shift > 0) {
                    lines.push(`- **Layout Shift:** ${settling.max_layout_shift}px (settled frame ${settling.settle_frame})`);
                    lines.push(`- **Stabilized:** ${settling.stabilized ? 'Yes' : 'No (timeout)'}`);
                }

                if (effects.new_elements?.length > 0) {
                    lines.push('');
                    lines.push('**New Elements:**');
                    effects.new_elements.forEach(el => {
                        lines.push(`- \`${el.selector}\` (${el.rect.width}x${el.rect.height})`);
                    });
                }

                if (effects.class_toggles?.length > 0) {
                    lines.push('');
                    lines.push('**Class Toggles:**');
                    effects.class_toggles.forEach(t => {
                        if (t.added?.length) lines.push(`- \`${t.selector}\` +${t.added.join(', +')}`);
                        if (t.removed?.length) lines.push(`- \`${t.selector}\` -${t.removed.join(', -')}`);
                    });
                }

                lines.push('');
            });

            return this.downloadText(lines.join('\n'), filename, 'text/markdown;charset=utf-8');
        } catch (error) {
            console.error('Markdown download failed:', error);
            return false;
        }
    }

    static async copyToClipboard(intentData) {
        try {
            const json = JSON.stringify(intentData, null, CONFIG.EXPORT.INDENT_SPACES);
            await navigator.clipboard.writeText(json);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    static getDownloadStats(intentData) {
        const json = JSON.stringify(intentData, null, CONFIG.EXPORT.INDENT_SPACES);
        const bytes = new Blob([json]).size;

        return {
            stepCount: intentData.intent_analysis?.steps?.length || 0,
            fileSize: this._formatBytes(bytes),
            fileSizeBytes: bytes,
            duration: this._calculateTotalDuration(intentData.intent_analysis?.steps || [])
        };
    }
}
