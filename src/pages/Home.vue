<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function goBmi() {
  router.push('/bmi')
}

function goHydration() {
  router.push('/hydration')
}

function goCalorie() {
  router.push('/calorie')
}

function goSleep() {
  router.push('/sleep')
}
</script>

<template>
  <main class="page">
    <header class="hero" aria-label="Welcome">
      <h1 class="hero-title">Welcome to your Health Care Assistant</h1>
      <p class="hero-subtitle">Choose a tool below to get started.</p>
    </header>

    <div class="cards-grid">
      <section class="card">
        <header class="header">
          <div class="badge bmi-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 13a8 8 0 1 1-16 0" />
              <path d="M12 13l4-4" />
              <path d="M4 13h16" />
            </svg>
            BMI
          </div>
          <h1 class="title">BMI Calculator</h1>
          <p class="subtitle">
            BMI reflects your body composition. Enter your height and weight to estimate BMI and get a quick category reference.
          </p>
        </header>

        <div class="cta">
          <button class="btn primary" type="button" @click="goBmi">Enter</button>
        </div>
      </section>

      <section class="card hydration-card">
        <header class="header">
          <div class="badge water-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            Hydration
          </div>
          <h1 class="title">Hydration Tracker</h1>
          <p class="subtitle">
            Drinking water is essential for health. Track your daily water intake, stay hydrated, and build a healthy habit.
          </p>
        </header>

        <div class="cta">
          <button class="btn water-btn" type="button" @click="goHydration">Start</button>
        </div>
      </section>

      <section class="card calorie-card">
        <header class="header">
          <div class="badge fire-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M13.5 2s.2 2.1-1.2 3.7c-1.1 1.3-2.8 1.9-3.6 3.5C7.9 10.8 9 12.7 9 12.7s-.3-2.1 1.1-3.6c.9-1 2.2-1.5 3-2.8C14 4.9 13.5 2 13.5 2z"
              />
              <path
                d="M12 22c4.1 0 7-2.8 7-6.7 0-2.7-1.6-4.9-4.3-6.4.4 1.8-.2 3.1-1.4 4.1-1 .8-1.8 2-1.8 3.3 0 1.7 1.2 2.9 1.2 2.9s-2 .2-3.4-1.1c-1.1-1-1.7-2.5-1.7-4.3 0-3.5 2.3-5.8 5.1-7.5C6.3 7.4 5 11.1 5 14.9 5 19 7.9 22 12 22z"
              />
            </svg>
           Calorie
          </div>
          <h1 class="title">Calorie Calculator</h1>
          <p class="subtitle">Know your everyday calorie needs. Estimate your BMR and total daily calories (TDEE) based on activity.</p>
        </header>

        <div class="cta">
          <button class="btn fire-btn" type="button" @click="goCalorie">Enter</button>
        </div>
      </section>

      <section class="card sleep-card">
        <header class="header">
          <div class="badge sleep-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5z" />
            </svg>
            Sleep
          </div>
          <h1 class="title">Sleep Assistant</h1>
          <p class="subtitle">Score your sleep based on sleep/wake time and awakenings, and get a focused improvement tip.</p>
        </header>

        <div class="cta">
          <button class="btn sleep-btn" type="button" @click="goSleep">Start</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 22px;
  padding: 42px 24px 28px;
}

.hero {
  width: min(1100px, 100%);
  text-align: left;
}

.hero-title {
  margin: 0;
  font-size: clamp(26px, 3.2vw, 40px);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 15px;
  line-height: 1.7;
}

.cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  width: min(1100px, 100%);
}

@media (min-width: 900px) {
  .cards-grid {
    grid-template-columns: repeat(2, minmax(360px, 1fr));
  }
}

.card {
  width: 100%;
  border-radius: 22px;
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
  transition: transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease, background 220ms ease;
  will-change: transform;
  display: flex;
  flex-direction: column;
}

.card:hover,
.card:focus-within {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.10);
  box-shadow:
    0 22px 65px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.06);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card:hover,
  .card:focus-within {
    transform: none;
  }
}

.header {
  text-align: left;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.3px;
}

.title {
  margin: 14px 0 8px;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.15;
}

.subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 15px;
  line-height: 1.7;
}

.cta {
  margin-top: auto;
  padding-top: 22px;
  display: grid;
  gap: 10px;
  justify-items: start;
}

.btn {
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.2s ease;
}

.btn:active {
  transform: translateY(1px);
}

.primary {
  color: #0b1220;
  background: linear-gradient(135deg, #6ee7b7, #34d399, #22c55e);
  filter: saturate(1.08);
}

.primary:hover {
  filter: saturate(1.18);
}

.hydration-card .badge.water-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #7dd3fc;
}

.badge.bmi-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.30);
  color: #86efac;
}

.water-btn {
  color: #fff;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9, #0284c7);
  filter: saturate(1.08);
}

.water-btn:hover {
  filter: saturate(1.18);
}

.calorie-card .badge.fire-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(251, 146, 60, 0.14);
  border-color: rgba(251, 146, 60, 0.32);
  color: #fdba74;
}

.fire-btn {
  color: #fff;
  background: linear-gradient(135deg, #fdba74, #fb923c, #f97316);
  filter: saturate(1.08);
}

.fire-btn:hover {
  filter: saturate(1.18);
}

.sleep-card .badge.sleep-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(167, 139, 250, 0.16);
  border-color: rgba(167, 139, 250, 0.32);
  color: #ddd6fe;
}

.sleep-btn {
  color: #fff;
  background: linear-gradient(135deg, #ddd6fe, #a78bfa, #8b5cf6);
  filter: saturate(1.08);
}

.sleep-btn:hover {
  filter: saturate(1.18);
}
</style>


