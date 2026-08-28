import { contextBridge, ipcRenderer } from 'electron';
import { Pool } from 'pg';

// Create DB pool in preload (Node context)
const dbPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'verichron_db',
  user: process.env.DB_USER || 'verichron',
  password: process.env.DB_PASSWORD || 'verichron',
  max: 10,
});

const dbApi = {
  getPipelineRuns: async () => {
    try {
      const result = await dbPool.query(`
        SELECT * FROM pipeline_runs
        ORDER BY created_at DESC
        LIMIT 100
      `);
      return result.rows;
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  },

  getStageStatus: async (runId: string) => {
    try {
      const result = await dbPool.query(`
        SELECT * FROM stage_runs
        WHERE pipeline_run_id = $1
        ORDER BY stage_order ASC
      `, [runId]);
      return result.rows;
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  },

  getForensicRecords: async (stageRunId: string) => {
    try {
      const result = await dbPool.query(`
        SELECT * FROM forensic_records
        WHERE stage_run_id = $1
        ORDER BY extracted_at ASC
        LIMIT 500
      `, [stageRunId]);
      return result.rows;
    } catch (err) {
      console.error('DB error:', err);
      throw err;
    }
  },
};

contextBridge.exposeInMainWorld('epoch', dbApi);
