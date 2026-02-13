/**
 * FlowCapture - Unified Download Manager
 * Eliminates 3 duplicate implementations:
 * - content.js:841-858
 * - popup.js:156-164
 * - content.js:586-595 (intent structure)
 */

import { CONFIG } from './constants.js';

/**
 * Download Manager - Handles file downloads and intent creation
 */
export class DownloadManager {
    /**
     * Create intent object with standard structure
     * @param {string} url - Current page URL
     * @param {Array} steps - Array of recorded step objects
     * @returns {Object} Structured intent object
     */
    static createIntent(url, steps) {
        return {
            url,
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
     * Calculate total duration from steps
     * @param {Array} steps - Array of step objects
     * @returns {number} Total duration in milliseconds
     * @private
     */
    static _calculateTotalDuration(steps) {
        if (!steps || steps.length === 0) return 0;

        const firstStep = steps[0];
        const lastStep = steps[steps.length - 1];

        if (firstStep.trigger?.timestamp && lastStep.trigger?.timestamp) {
            return lastStep.trigger.timestamp - firstStep.trigger.timestamp;
        }

        // Fallback: sum all step durations
        return steps.reduce((total, step) => {
            return total + (step.duration_ms || 0);
        }, 0);
    }

    /**
     * Download JSON data as file
     * @param {Object} data - Data to download
     * @param {string} filename - Output filename (default from CONFIG)
     * @param {number} indent - JSON indentation (default from CONFIG)
     * @returns {boolean} True if download initiated successfully
     */
    static downloadJSON(data, filename = null, indent = null) {
        try {
            const finalFilename = filename || CONFIG.EXPORT.FILE_NAME;
            const finalIndent = indent !== null ? indent : CONFIG.EXPORT.INDENT_SPACES;

            // Create JSON blob
            const jsonString = JSON.stringify(data, null, finalIndent);
            const blob = new Blob([jsonString], {
                type: 'application/json;charset=utf-8'
            });

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            a.style.display = 'none';

            // Trigger download
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log(`Downloaded: ${finalFilename} (${this._formatBytes(blob.size)})`);
            return true;
        } catch (error) {
            console.error('Download failed:', error);
            return false;
        }
    }

    /**
     * Download current flow from window global
     * Convenience method for content script
     * @param {string} filename - Optional custom filename
     * @returns {Promise<boolean>} True if successful
     */
    static async downloadCurrentFlow(filename = null) {
        try {
            // Access global flowCapture instance
            const recordedSteps = window.flowCapture?.recordedSteps || [];

            if (recordedSteps.length === 0) {
                console.warn('No recorded steps to download');
                return false;
            }

            const intent = this.createIntent(window.location.href, recordedSteps);

            // Generate filename with timestamp if not provided
            const finalFilename = filename || this._generateFilename();

            return this.downloadJSON(intent, finalFilename);
        } catch (error) {
            console.error('Failed to download current flow:', error);
            return false;
        }
    }

    /**
     * Generate filename with timestamp
     * @returns {string} Generated filename
     * @private
     */
    static _generateFilename() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        return `flow_capture_${dateStr}_${timeStr}.json`;
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Byte count
     * @returns {string} Formatted string (e.g., "2.5 KB")
     * @private
     */
    static _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Download text content as file
     * @param {string} text - Text content
     * @param {string} filename - Output filename
     * @param {string} mimeType - MIME type (default: text/plain)
     * @returns {boolean} True if successful
     */
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
     * Download steps as CSV format
     * @param {Array} steps - Array of step objects
     * @param {string} filename - Output filename
     * @returns {boolean} True if successful
     */
    static downloadStepsAsCSV(steps, filename = 'flow_capture.csv') {
        try {
            // CSV header
            const headers = ['Step ID', 'Type', 'Selector', 'Value', 'Duration (ms)', 'Visual Changes'];

            // Convert steps to CSV rows
            const rows = steps.map(step => {
                const trigger = step.trigger || {};
                return [
                    step.step_id || '',
                    trigger.type || '',
                    trigger.selector || '',
                    trigger.value || '',
                    step.duration_ms || 0,
                    (step.visual_changes || []).length
                ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
            });

            // Combine header and rows
            const csv = [headers.join(','), ...rows].join('\n');

            return this.downloadText(csv, filename, 'text/csv;charset=utf-8');
        } catch (error) {
            console.error('CSV download failed:', error);
            return false;
        }
    }

    /**
     * Download steps as Markdown format
     * @param {Array} steps - Array of step objects
     * @param {string} filename - Output filename
     * @returns {boolean} True if successful
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
                lines.push(`### ${index + 1}. ${trigger.type || 'Unknown'}`);
                lines.push('');
                lines.push(`- **Selector:** \`${trigger.selector || 'N/A'}\``);

                if (trigger.value !== undefined) {
                    lines.push(`- **Value:** ${trigger.value}`);
                }

                lines.push(`- **Duration:** ${step.duration_ms || 0}ms`);
                lines.push(`- **Visual Changes:** ${(step.visual_changes || []).length}`);

                if (step.visual_changes && step.visual_changes.length > 0) {
                    lines.push('');
                    lines.push('**Changes:**');
                    step.visual_changes.forEach(change => {
                        lines.push(`- \`${change.selector}\`: ${change.property} (${change.before} → ${change.after})`);
                    });
                }

                lines.push('');
            });

            const markdown = lines.join('\n');
            return this.downloadText(markdown, filename, 'text/markdown;charset=utf-8');
        } catch (error) {
            console.error('Markdown download failed:', error);
            return false;
        }
    }

    /**
     * Copy intent data to clipboard
     * @param {Object} intentData - Intent object to copy
     * @returns {Promise<boolean>} True if successful
     */
    static async copyToClipboard(intentData) {
        try {
            const jsonString = JSON.stringify(intentData, null, CONFIG.EXPORT.INDENT_SPACES);
            await navigator.clipboard.writeText(jsonString);
            console.log('Intent data copied to clipboard');
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Validate intent data structure
     * @param {Object} intent - Intent object to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateIntent(intent) {
        const errors = [];

        if (!intent) {
            errors.push('Intent is null or undefined');
            return { isValid: false, errors };
        }

        if (!intent.url) {
            errors.push('Missing URL');
        }

        if (!intent.intent_analysis) {
            errors.push('Missing intent_analysis object');
            return { isValid: false, errors };
        }

        if (!Array.isArray(intent.intent_analysis.steps)) {
            errors.push('steps must be an array');
        } else if (intent.intent_analysis.steps.length === 0) {
            errors.push('steps array is empty');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get download statistics
     * @param {Object} intentData - Intent object
     * @returns {Object} Statistics about the data
     */
    static getDownloadStats(intentData) {
        const jsonString = JSON.stringify(intentData, null, CONFIG.EXPORT.INDENT_SPACES);
        const bytes = new Blob([jsonString]).size;

        return {
            stepCount: intentData.intent_analysis?.steps?.length || 0,
            fileSize: this._formatBytes(bytes),
            fileSizeBytes: bytes,
            duration: this._calculateTotalDuration(intentData.intent_analysis?.steps || []),
            estimatedDownloadTime: bytes < 100000 ? 'Instant' : '< 1s'
        };
    }
}
