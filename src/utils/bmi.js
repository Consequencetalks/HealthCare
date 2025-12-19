export function classifyBmi(bmi) {
  // Adult reference (commonly used in CN): <18.5 underweight; 18.5–23.9 normal; 24.0–27.9 overweight; ≥28 obese
  // Extra split: <16 => severely underweight
  if (bmi < 16) {
    return {
      category: 'Severely underweight',
      hint: 'Consider evaluating nutrition and overall health; consult a doctor/dietitian if needed.',
    }
  }
  if (bmi < 18.5) return { category: 'Underweight', hint: 'Focus on adequate calories/protein and keep a regular routine.' }
  if (bmi < 24) return { category: 'Normal', hint: 'Keep a balanced diet and regular physical activity.' }
  if (bmi < 28) return { category: 'Overweight', hint: 'Try increasing daily activity and moderating high-calorie foods.' }
  return { category: 'Obese', hint: 'Build a gradual diet & exercise plan; consider professional guidance if needed.' }
}


