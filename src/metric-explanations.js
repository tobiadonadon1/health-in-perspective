const recovery={source:'WHOOP · Understanding recovery',url:'https://support.whoop.com/s/article/WHOOP-Recovery'};
const sleep={source:'WHOOP · Understanding sleep',url:'https://support.whoop.com/s/article/WHOOP-Sleep?language=en_US'};
// Each signal links to a source about that signal, not to a device score that merely uses it.
const heart={source:'MedlinePlus · Pulse',url:'https://medlineplus.gov/ency/article/003399.htm'};
const hrvSource={source:'Cleveland Clinic · Heart rate variability',url:'https://my.clevelandclinic.org/health/articles/21773-heart-rate-variability-hrv'};
const oxygen={source:'MedlinePlus · Pulse oximetry',url:'https://medlineplus.gov/lab-tests/pulse-oximetry/'};
const vitals={source:'Cleveland Clinic · Vital signs',url:'https://my.clevelandclinic.org/health/articles/10881-vital-signs'};
const temperature={source:'Apple · Wrist temperature during sleep',url:'https://support.apple.com/en-us/102674'};
const strainSource={source:'WHOOP · Strain and physiological cycles',url:'https://developer.whoop.com/docs/whoop-101'};
const apple={source:'Apple · Health measurements',url:'https://support.apple.com/en-us/120277'};
const entries={
 resting_hr:['Your heartbeats per minute at rest. WHOOP estimates this during sleep.','Compare with your usual pattern. A change alone does not identify its cause.',heart],
 hrv:['The variation in time between heartbeats, measured in milliseconds.','Your own baseline matters more than another person’s number. Compare like-for-like measurements from the same device.',hrvSource],
 spo2:['An estimate of the percentage of oxygen-saturated haemoglobin in your blood.','A wearable reading is a signal to put in context, not a diagnosis. Sensor fit and measurement conditions matter.',oxygen],
 recovery:['WHOOP’s daily estimate of readiness, combining several overnight signals.','This is a device score, not a medical assessment. Consider it alongside how you feel.',recovery],
 respiratory_rate:['How many breaths you take per minute. WHOOP reports this during sleep.','Look for changes from your own pattern across several nights.',vitals],
 skin_temperature:['Temperature measured at the skin, rather than your internal body temperature.','Room temperature, device contact and your body’s daily rhythms can affect this reading.',temperature],
 sleep:['The time your device estimated you were asleep, excluding detected awake time.','Look at duration alongside regularity and how rested you feel.',sleep],
 sleep_performance:['WHOOP’s sleep score, combining sleep sufficiency, consistency, efficiency and sleep stress.','A percentage summarises several factors. Open the individual sleep metrics for more context.',sleep],
 sleep_efficiency:['The share of your time in bed that your device estimated you were asleep.','Time awake in bed lowers this percentage; it is different from total sleep duration.',sleep],
 sleep_consistency:['How regular your recent bedtimes and wake-up times have been.','Use the trend to understand your schedule, rather than judging a single night.',sleep],
 sleep_deep:['Time your wearable estimated you spent in deep, slow-wave sleep.','Sleep stages are estimates from wearable signals, not a clinical sleep study.',sleep],
 sleep_rem:['Time your wearable estimated you spent in rapid-eye-movement sleep.','Compare patterns over several nights. Stage estimates can differ between devices.',sleep],
 sleep_light:['Time your wearable estimated you spent in lighter sleep stages.','Light sleep is a normal part of sleep. It is not the same as being awake.',sleep],
 sleep_awake:['Time detected as awake during your recorded sleep session.','Brief awakenings may occur without you remembering them.',sleep],
 sleep_needed:['WHOOP’s estimate of the sleep you need, based on your baseline and recent activity and sleep.','This is a personalised estimate, not a prescribed number of hours.',sleep],
 sleep_debt:['WHOOP’s estimate of accumulated sleep shortfall.','It depends on the device’s sleep-need estimate and recorded sleep.',sleep],
 sleep_disturbances:['The number of wake events detected during a sleep session.','This is a count, not the duration of time awake.',sleep],
 nap:['The duration of a recorded nap, in hours.','Naps are shown separately from your main sleep session.',sleep],
 heart_rate:['Your heartbeats per minute. WHOOP reports the average across its physiological day; imports may report a daily average of recorded moments.','Activity, emotions and medication can change heart rate. A daily average is different from your resting heart rate.',heart],
 hrv_sdnn:['Heart-rate variability calculated using SDNN: the spread of normal beat-to-beat intervals.','SDNN and WHOOP’s HRV method are different. Compare the same measurement method and source over time.',{source:'Apple · HRV (SDNN)',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn'}],
 weight:['Your recorded body mass, imported from a scale or health record.','Short-term changes can reflect fluid, food and measurement timing. Compare under similar conditions.',{source:'Apple · Body mass',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodymass'}],
 body_fat:['The percentage of your body mass reported as fat by the connected measurement source.','Scale estimates vary with method and conditions. Xeyo does not calculate body fat from a photo.',{source:'Apple · Body fat percentage',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodyfatpercentage'}],
 lean_mass:['Your recorded body mass excluding fat. This includes more than muscle alone.','Keep the measurement method consistent when comparing results.',{source:'Apple · Lean body mass',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/leanbodymass'}],
 steps:['The number of steps reported in a source record.','Exports may contain intervals rather than daily totals. The graph preserves the imported records.',{source:'Apple · Step count',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/stepcount'}],
 strain:['WHOOP’s measure of cardiovascular load across its physiological day, on a scale from 0 to 21.','The scale is not linear: each point is harder to gain as the number rises. This is a device score, not a measure of fitness.',strainSource],
 energy_burned:['The total energy your wearable estimated you used over the day, including resting energy, in kilocalories.','This is an estimate from heart rate and personal details. It differs from active energy, which excludes energy used at rest.',strainSource],
 active_energy:['An estimate of energy used through activity, in kilocalories.','This excludes resting energy. Imported intervals may not represent a full day.',{source:'Apple · Active energy',url:'https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned'}]
};
export function metricExplanation(kind){const [meaning,context,source]=entries[kind]||['A measurement reported by your connected source.','Compare readings from the same source over time.',apple];return {meaning,context,...source};}
