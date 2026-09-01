import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dashboard } from './dashboard';
import type { AnalysisResult } from '../../models/job';

const result: AnalysisResult = {
  overview: {
    projectName: 'demo',
    mainLanguage: 'TypeScript',
    mainFramework: 'Express',
    fileCount: 12,
  },
  functionalSummary: 'API de ejemplo',
  technologies: [{ name: 'Express', category: 'framework', evidence: 'package.json' }],
  architecture: { pattern: 'hexagonal', confidence: 0.8, rationale: 'ports/adapters', evidence: [] },
  findings: { components: [], recommendations: [], risks: [] },
  generatedAt: '2026-01-01T00:00:00Z',
  model: 'claude-sonnet-5',
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Dashboard] }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    fixture.componentRef.setInput('result', result);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
