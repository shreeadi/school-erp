import type { Board } from '../../generated/prisma/enums.js';

/**
 * Optional starting templates applied when a school is provisioned. They are
 * ordinary rows afterwards: the school edits or replaces them freely. Nothing in
 * the application logic depends on a particular board.
 */
export interface BoardTemplate {
  gradingScale: { name: string; type: 'PERCENTAGE_BANDS' | 'GPA' | 'DESCRIPTIVE'; passPercent: number; bands: { label: string; min: number; max: number; point?: number; remark?: string }[] };
  examCategories: { name: string; code: string; weightage: number; maxMarks: number; passing?: number; internal?: boolean }[];
}

const CBSE: BoardTemplate = {
  gradingScale: {
    name: 'CBSE 9-point scale', type: 'PERCENTAGE_BANDS', passPercent: 33,
    bands: [
      { label: 'A1', min: 91, max: 100, point: 10 }, { label: 'A2', min: 81, max: 90.99, point: 9 },
      { label: 'B1', min: 71, max: 80.99, point: 8 }, { label: 'B2', min: 61, max: 70.99, point: 7 },
      { label: 'C1', min: 51, max: 60.99, point: 6 }, { label: 'C2', min: 41, max: 50.99, point: 5 },
      { label: 'D', min: 33, max: 40.99, point: 4 }, { label: 'E', min: 0, max: 32.99, point: 0, remark: 'Needs improvement' },
    ],
  },
  examCategories: [
    { name: 'Periodic Test', code: 'PT', weightage: 10, maxMarks: 40, internal: true },
    { name: 'Notebook Submission', code: 'NB', weightage: 5, maxMarks: 5, internal: true },
    { name: 'Subject Enrichment', code: 'SE', weightage: 5, maxMarks: 5, internal: true },
    { name: 'Half-Yearly Examination', code: 'HY', weightage: 30, maxMarks: 80, passing: 27 },
    { name: 'Annual Examination', code: 'AE', weightage: 50, maxMarks: 80, passing: 27 },
  ],
};

const ICSE: BoardTemplate = {
  gradingScale: {
    name: 'ICSE percentage bands', type: 'PERCENTAGE_BANDS', passPercent: 35,
    bands: [
      { label: '1', min: 90, max: 100, remark: 'Excellent' }, { label: '2', min: 80, max: 89.99, remark: 'Very good' },
      { label: '3', min: 70, max: 79.99, remark: 'Good' }, { label: '4', min: 60, max: 69.99, remark: 'Credit' },
      { label: '5', min: 50, max: 59.99, remark: 'Credit' }, { label: '6', min: 40, max: 49.99, remark: 'Pass' },
      { label: '7', min: 35, max: 39.99, remark: 'Pass' }, { label: '8', min: 0, max: 34.99, remark: 'Fail' },
    ],
  },
  examCategories: [
    { name: 'Unit Test', code: 'UT', weightage: 20, maxMarks: 25, internal: true },
    { name: 'Internal Assessment', code: 'IA', weightage: 20, maxMarks: 20, internal: true },
    { name: 'Term Examination', code: 'TE', weightage: 60, maxMarks: 80, passing: 28 },
  ],
};

const STATE: BoardTemplate = {
  gradingScale: {
    name: 'State board grades', type: 'PERCENTAGE_BANDS', passPercent: 35,
    bands: [
      { label: 'A+', min: 90, max: 100 }, { label: 'A', min: 80, max: 89.99 }, { label: 'B+', min: 70, max: 79.99 },
      { label: 'B', min: 60, max: 69.99 }, { label: 'C+', min: 50, max: 59.99 }, { label: 'C', min: 35, max: 49.99 },
      { label: 'D', min: 0, max: 34.99, remark: 'Not cleared' },
    ],
  },
  examCategories: [
    { name: 'Formative Assessment', code: 'FA', weightage: 20, maxMarks: 20, internal: true },
    { name: 'Summative Assessment 1', code: 'SA1', weightage: 30, maxMarks: 80, passing: 28 },
    { name: 'Summative Assessment 2', code: 'SA2', weightage: 50, maxMarks: 80, passing: 28 },
  ],
};

const INTERNATIONAL: BoardTemplate = {
  gradingScale: {
    name: '7-point scale', type: 'GPA', passPercent: 40,
    bands: [
      { label: '7', min: 85, max: 100, point: 7 }, { label: '6', min: 72, max: 84.99, point: 6 },
      { label: '5', min: 58, max: 71.99, point: 5 }, { label: '4', min: 45, max: 57.99, point: 4 },
      { label: '3', min: 32, max: 44.99, point: 3 }, { label: '2', min: 18, max: 31.99, point: 2 },
      { label: '1', min: 0, max: 17.99, point: 1 },
    ],
  },
  examCategories: [
    { name: 'Formative Tasks', code: 'FT', weightage: 30, maxMarks: 100, internal: true },
    { name: 'Summative Assessment', code: 'SUM', weightage: 70, maxMarks: 100 },
  ],
};

export function templateFor(board: Board): BoardTemplate | null {
  switch (board) {
    case 'CBSE': return CBSE;
    case 'ICSE': return ICSE;
    case 'STATE_BOARD': return STATE;
    case 'IB':
    case 'CAMBRIDGE': return INTERNATIONAL;
    default: return null;
  }
}
