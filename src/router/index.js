import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Bmi from '../pages/Bmi.vue'
import HydrationTracker from '../pages/HydrationTracker.vue'
import Calorie from '../pages/Calorie.vue'
import SleepAssistant from '../pages/SleepAssistant.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/bmi', name: 'bmi', component: Bmi },
    { path: '/hydration', name: 'hydration', component: HydrationTracker },
    { path: '/calorie', name: 'calorie', component: Calorie },
    { path: '/sleep', name: 'sleep', component: SleepAssistant },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router


