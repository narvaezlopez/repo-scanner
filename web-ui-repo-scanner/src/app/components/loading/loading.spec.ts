import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Loading } from './loading';

vi.mock('lottie-web', () => ({
  default: { loadAnimation: () => ({ addEventListener: () => {}, destroy: () => {} }) },
}));

describe('Loading', () => {
  let component: Loading;
  let fixture: ComponentFixture<Loading>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Loading],
    }).compileComponents();

    fixture = TestBed.createComponent(Loading);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
