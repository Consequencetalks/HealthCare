<template>
  <div class="app-shell">
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <Transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="app-footer" aria-label="Site footer">
      <div class="footer-inner">
        <span>Developed by <strong class="footer-strong">Feng Luquan</strong></span>
        <span class="footer-sep" aria-hidden="true">·</span>
        <a
          class="footer-link"
          href="https://github.com/Consequencetalks"
          target="_blank"
          rel="noreferrer"
        >
          GitHub: Consequencetalks
        </a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router'
</script>
