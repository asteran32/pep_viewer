# Codebook v2.2: YouTube 반려동물 종양 영양 Claim·임상위험·댓글 분석

## 0. 목적과 적용 범위

이 코드북은 개·고양이의 암/종양과 영양을 다루는 공개 YouTube 콘텐츠를 **claim(주장) 단위**로 분석하기 위한 기준이다. v2.1의 content taxonomy, evidence relationship, misinformation theme, actor type, stance 틀과 용어를 유지하되, 다음을 보완한다.

- 영상 1행 분류가 아닌 `claim_id`별 분류
- 근거 관계와 임상 위험을 별도 변수로 코딩
- 상업성의 유무·형태·증거를 분리
- 댓글의 stance와 실행/구매 반응을 별도 코딩
- 관련성, 전사 품질, 언어, 결측을 재현 가능하게 기록
- misinformation theme의 `없음`, `범위 밖`, `판정 불가`를 분리하고, 영양 주장 기전·발화 방향·근거 출처를 별도 코딩
- E0 Reference Standard Proposal v0.2에 따라 evidence 적용 가능성, E0 양성 판정 원칙, 핵심 주장 근거와 risk modifier를 분리
- “수의사와 상담” 문구가 부정확하거나 근거 없는 핵심 주장을 E0로 바꾸지 못하도록 명시

분석 대상은 공개적으로 접근 가능한 영상의 제목, 설명, 고정 댓글, 접근 가능한 자막/전사문, 공개 댓글이다. 개별 채널·보호자를 비난하거나 실제 보호자의 신념·행동을 추정하는 데 사용하지 않는다.

**최상위 원칙:** `evidence`는 claim의 **핵심 명제(core claim)**가 현행 수의영양·수의종양 진료 원칙 및 확인 가능한 근거와 맺는 관계를 코딩한다. 상담 권고, 면책 문구, 안전 경고, 제한 조건은 별도 `risk_modifier`로 기록하며, 핵심 명제의 근거 상태를 덮어쓰지 않는다.

## 1. 분석 단위와 데이터셋 구조

### 1.1 분석 단위

| 단위 | 1행의 의미 | 필수 식별자 | 주요 용도 |
|---|---|---|---|
| Video-level | 영상 1개 | `video_id` | 표본 흐름, 메타데이터, 채널·상업성 |
| Claim-level | 검증 가능한 영양 관련 주장 1개 | `claim_id`, `video_id` | evidence, theme, risk, 임상 번역 |
| Comment-level | 댓글 또는 답글 1개 | `comment_id`, `video_id` | stance, 구매/실행·정정 반응 |

**원칙:** 한 영상에 여러 claim이 있으면 claim마다 별도 행을 만든다. 하나의 문장 안에 독립된 개입 또는 결과 주장이 둘 이상이면 claim을 분리한다. 예를 들어 “후코이단이 면역을 높이고 종양을 줄인다”는 `immune_boost`와 `tumor_shrinkage` claim을 각각 기록하거나, 사전 정의한 다중값 규칙에 따라 두 결과를 기록한다. 원문 문장과 시간/텍스트 위치는 보존한다.

### 1.2 필수 공통 변수

| 변수 | 형식 | 정의/코딩 규칙 |
|---|---|---|
| `video_id` | string | YouTube video ID |
| `url` | string | 정규화된 영상 URL |
| `collection_timestamp` | ISO 8601 datetime | 메타데이터/댓글을 수집한 시점 |
| `query_id` | string | 검색 로그의 질의 식별자. 영상이 여러 질의에 걸리면 별도 연결 테이블에 모두 보존 |
| `query_text` | text | 실제 사용한 검색어 |
| `query_language` | categorical | 검색어 언어: `ko`, `en`, `other` |
| `content_language` | categorical | 영상 발화/주요 텍스트 언어: `ko`, `en`, `mixed`, `other`, `unclear` |
| `coder_id` | string | 해당 값을 입력한 코더 |
| `codebook_version` | string | `v2.2` |
| `coding_date` | ISO 8601 date | 최종 코딩일 |
| `adjudication_status` | categorical | `single_coded`, `double_coded_agreed`, `adjudicated`, `not_applicable` |

### 1.3 Video-level 필수 변수

| 변수 | 형식 | 정의/코딩 규칙 |
|---|---|---|
| `title`, `description` | text | 원문 보존. 공개 설명이 없으면 `NA_not_available` |
| `upload_date` | ISO 8601 datetime/string | YouTube 표시 업로드 시점. 확인 불가 시 `NA_not_available` |
| `channel_id`, `channel_title` | string/text | 원문 보존, 공개 보고 시 익명화 원칙 적용. 확인 불가 시 `NA_not_available` |
| `duration_sec` | integer/string | 영상 전체 길이(초). 확인 불가 시 `NA_not_available` |
| `view_count`, `like_count`, `comment_count` | integer/string | 수집 시점의 값. 플랫폼에서 비공개·미제공이면 `NA_not_available` |
| `video_type` | categorical | `long_form`, `shorts`, `live_or_archive`, `unclear` |
| `relevance_status` | categorical | 아래 2절 기준 |
| `exclusion_reason` | categorical/text | 제외 시 필수 입력. 포함 시 `NA_not_applicable` |
| `transcript_available` | categorical | `true`, `false`, `unclear` |
| `transcript_source` | categorical | `creator_caption`, `platform_caption`, `STT`, `manual_transcript`, `none`, `unclear` |
| `transcript_start_sec`, `transcript_end_sec` | integer/string | 실제 분석에 사용한 전사 범위. 없으면 `NA_not_applicable`, 확인 불가 시 `NA_not_available` |
| `transcript_char_count` | integer/string | 저장 전사문의 문자 수. 전사 없음은 `0`, 확인 불가 시 `NA_not_available` |

### 1.4 Claim-level 필수 변수

| 변수 | 형식 | 정의/코딩 규칙 |
|---|---|---|
| `claim_id` | string | 고유 식별자. 예: `<video_id>_C001` |
| `claim_text` | text | 원문 문장 또는 최소 필요 문맥을 포함한 정확한 발췌 |
| `claim_paraphrase` | text | 보고용 비식별·비추적 가능 요약 |
| `claim_source` | categorical | `title`, `description`, `pinned_comment`, `transcript`, `on_screen_text`, `other` |
| `source_start_sec`, `source_end_sec` | integer/string | 전사/영상 발화 claim이면 초 단위 위치. 해당 없으면 `NA_not_applicable`, 위치 확인 불가 시 `NA_not_available` |
| `context_qualifier` | text/code | “일부 환자”, “수의사 상담 후”, 치료단계·용량 등 제한 조건. 확인된 제한 없음은 `none_identified`, 판정 불가는 `not_assessable` |
| `claim_eligibility` | categorical | `eligible`, `not_nutrition_related`, `duplicate`, `unclear` |
| `duplicate_of_claim_id` | string | 중복 claim이면 기준 claim ID, 그 외 `NA_not_applicable` |
| `claim_target` | categorical | `cancer_treatment`, `cancer_prevention`, `supportive_care`, `general_health`, `unclear` |
| `nutrition_claim_mechanism` | multi-label categorical | 아래 5.1절의 중립적 영양 주장 기전 |
| `claim_orientation` | categorical | 아래 5.2절의 주장 방향. 주장을 지지·교정·조건부로 말하는지 구분 |
| `claim_strength` | categorical | `descriptive`, `possible`, `supports`, `recommended`, `must_or_always`, `cure_or_replace`, `unclear` |
| `evidence_source_type` | multi-label categorical | 아래 4.5절의 근거 출처·직접성. 발화자의 직함이나 채널 유형과 무관하게 코딩 |
| `evidence_applicability` | categorical | 아래 4.1절. E0–E5 판정의 적용 가능 여부 |
| `core_claim_evidence` | categorical | 아래 4.2절. 면책·상담 문구를 제외한 핵심 명제의 근거 상태 |
| `e0_reference_principle` | multi-label categorical | 아래 4.3절. E0가 의존하는 명시적 수의영양·종양 지지관리 원칙 |
| `evidence` | categorical | 아래 4절의 E0–E5 또는 명시적 비적용/판정 불가 코드 |
| `evidence_rationale` | text/code | 핵심 명제, 적용 원칙, 제한 조건을 연결한 1–3문장. 비적용은 `NA_not_applicable`, 판정 불가는 `not_assessable` |
| `evidence_source` | text/code | 판정에 사용한 가이드라인·문헌·표준. 사용하지 않았으면 `none_identified`, 확인 불가 시 `not_assessable` |
| `e0_red_flag` | multi-label categorical | 아래 4.4절. E0 부여를 금지하거나 재검토하게 하는 단서 |
| `risk_modifier` | multi-label categorical | 아래 6.3절. 위해를 낮추거나 높이는 제한·안전·대체치료 문구 |
| `risk_modifier_direction` | categorical | `risk_reducing`, `risk_increasing`, `mixed`, `none_identified`, `not_assessable` |
| `risk_modifier_rationale` | text/code | modifier가 위험도에 미치는 이유. 없음은 `none_identified`, 판정 불가는 `not_assessable` |

### 1.5 Comment-level 필수 변수

| 변수 | 형식 | 정의/코딩 규칙 |
|---|---|---|
| `comment_id` | string | YouTube comment ID |
| `parent_comment_id` | string | 답글이면 부모 댓글 ID, 최상위 댓글이면 `NA_not_applicable` |
| `is_reply`, `is_owner` | categorical | `true`, `false`, `unclear` |
| `published_at` | ISO 8601 datetime/string | 댓글 게시 시점. 확인 불가 시 `NA_not_available` |
| `like_count` | integer/string | 수집 시점 댓글 좋아요 수. 확인 불가 시 `NA_not_available` |
| `comment_text` | text | 원문 보존. 외부 보고는 원칙적으로 paraphrase |
| `linked_claim_id` | string | 반응 대상 claim. 여러 claim이면 세미콜론으로 복수 기록, 연결 불가 시 `not_assessable` |
| `stance` | categorical | 아래 8절 기준 |
| `comment_action` | multi-label categorical | 아래 8절 기준 |

## 2. 관련성 선별

### 2.1 `relevance_status`

| 코드 | 정의 | 처리 |
|---|---|---|
| `include` | 개/고양이/반려동물과 암·종양·항암 맥락이 있고, 분석 가능한 영양 claim이 1개 이상 있음 | Claim 추출 진행 |
| `exclude` | 포함 기준에 맞지 않음 | `exclusion_reason` 필수 |
| `uncertain` | 정보 부족, 언어/접근 제한, 종·암 관련성 애매 | 2차 코더 또는 전문가 검토 |
| `pending_manual_review` | 아직 수기 검토 전 | 최종 분석 표본에 포함하지 않음 |

### 2.2 `exclusion_reason`

- `human_only`
- `non_pet_content`
- `non_cancer_pet_content`
- `no_nutrition_claim`
- `duplicate_or_reupload`
- `access_restricted_or_deleted`
- `out_of_language_scope`
- `insufficient_context`
- `other` (자유기술 필수)
- `NA_not_applicable` (`relevance_status = include`인 경우)

**결정 규칙:** 조회수 기준은 관련성 선별 후 적용한다. `included_by_threshold`는 표본 층화 변수이며, `relevance_status = include`를 대체하지 않는다.

## 3. Content taxonomy

### 3.1 `content_scope` (video-level)

| 코드 | 정의 |
|---|---|
| `nutritional_intervention` | 식품·식단·영양소·보충제·급여 방식·식이 제한이 암 또는 치료 관련 결과에 영향을 준다고 주장/암시 |
| `non_nutritional_cancer_treatment` | 암 치료를 다루지만 영양 개입 claim이 없음 |
| `cancer_education_no_intervention` | 암 일반 교육이며 특정 개입 claim이 없음 |
| `caregiver_experience` | 보호자의 치료/돌봄 경험이 중심이고 일반화 가능한 영양 claim이 없음 |
| `non_cancer_pet_content` | 반려동물 콘텐츠지만 암 맥락 없음 |
| `non_pet_human_content` | 사람 대상 또는 비반려동물 콘텐츠 |
| `irrelevant` | 검색 오류·무관 콘텐츠 |

### 3.2 `intervention_type` (claim-level, 다중값 허용)

- `commercial_dry_wet_diet`
- `prescription_therapeutic_diet`
- `home_cooked_diet`
- `commercial_cooked_fresh_diet`
- `raw_diet`
- `ketogenic_low_carbohydrate_diet`
- `supplement`
- `single_ingredient`
- `general_dietary_advice`
- `assisted_feeding_nutritional_support`
- `food_avoidance_dietary_exclusion`
- `feeding_restriction`
- `topper_treat`
- `mixed_combination_dietary_intervention`
- `no_intervention_mentioned`
- `not_applicable_out_of_scope`
- `unclear`

**우선 규칙:** 특정 제품은 개입 자체가 아니라 `intervention_type`과 상업성 변수를 각각 코딩한다. 예를 들어 제품형 후코이단은 `supplement` + 상업성 코드이며, 제품명만으로 `commercial_seller_affiliate`를 자동 부여하지 않는다.

### 3.3 `claimed_outcome` (claim-level, 다중값 허용)

- `tumor_shrinkage`
- `cure`
- `survival`
- `immune_boost`
- `detoxification`
- `inflammation_reduction`
- `appetite_improvement`
- `cachexia_prevention`
- `treatment_tolerance`
- `quality_of_life`
- `replacement_of_veterinary_treatment`
- `prevention_or_risk_reduction`
- `unclear`
- `general_health_or_wellness`
- `disease_or_symptom_mangement`
- `body_condition_or_physical_function`
- `nutritional_adequacy_or_food_safety`

`prevention_or_risk_reduction`은 암 발생 예방 또는 위험 감소를 주장할 때 사용한다. 치료 중 효과와 예방 효과가 함께 제시되면 모두 코딩한다.

### 3.4 대상·질환·치료 맥락

| 변수 | 허용값 |
|---|---|
| `species` | `dog`, `cat`, `both`, `companion_animal_general`, `unclear` |
| `cancer_specificity` | `general_cancer`, `lymphoma`, `mast_cell_tumor`, `mammary_tumor`, `GI_tumor`, `oral_tumor`, `hemangiosarcoma`, `osteosarcoma`, `other_specified`, `unspecified` |
| `treatment_context` | `before_treatment`, `during_chemotherapy`, `post_surgery`, `radiation_therapy`, `palliative_care`, `terminal_cancer`, `surveillance_or_prevention`, `unspecified` |

#### 3.4.1 `cancer_specificity` 핵심 정의

- `general_cancer`: claim이 특정 암종에 한정되지 않고 **암 또는 종양 전반에 적용된다고 명시적으로 표현된 경우**. 이는 유효한 질환 범주이며 결측값이 아니다.
- `unspecified`: claim의 암 관련성은 확인되지만, 이용 가능한 제목·설명·전사문·화면 텍스트·주변 문맥만으로 **특정 암종인지 암 전반인지 신뢰성 있게 결정할 수 없는 경우**. 이는 코딩된 불명확 상태이며 빈값이 아니다.

#### 3.4.2 결정 규칙

다음 순서로 판정한다.

1. **특정 암종이 명시되거나 명확히 지시되는가?**
   - “림프종 환자에게…” → `lymphoma`
   - “비만세포종에는…” → `mast_cell_tumor`
   - 목록에 없는 특정 암종 → `other_specified`로 코딩하고 암종명을 보조 자유기술 필드에 기록한다.
2. **특정 암종이 없고 암/종양 전반에 적용한다고 명시하는가?**
   - “암 환자는…”, “모든 종양 환자에게…”, “반려동물 암에는 일반적으로…” → `general_cancer`
3. **암 관련성은 확인되지만 적용 범위가 불명확한가?**
   - “이 병”, “우리 아이”, “진단 후”처럼 지시 대상이 불분명하거나, 문맥이 잘려 특정 암종/암 전반 여부를 결정할 수 없음 → `unspecified`

**주의:** 특정 암종명이 없다는 이유만으로 `general_cancer`를 부여하지 않는다. `general_cancer`에는 암 전반으로의 명시적 적용 또는 일반화가 필요하다. 제목의 암종을 claim에 연결하려면 해당 claim이 그 제목의 사례·질환을 가리킨다는 문맥적 연결이 명확해야 한다.

#### 3.4.3 비교 예시

| Claim 또는 문맥 | 코드 | 이유 |
|---|---|---|
| “암에 걸린 강아지는 탄수화물을 끊어야 한다.” | `general_cancer` | 암 전반에 적용한다고 표현 |
| “모든 종양 환자에게 후코이단이 필요하다.” | `general_cancer` | 모든 종양 환자로 명시적 일반화 |
| “림프종 강아지는 탄수화물을 끊어야 한다.” | `lymphoma` | 특정 암종 명시 |
| “이 병에는 탄수화물을 끊는 것이 좋다.” | `unspecified` | 암 관련성은 있으나 ‘이 병’의 범위 불명확 |
| “우리 아이가 진단받은 후 후코이단을 먹였다.” | `unspecified` | 암 진단 맥락은 확인되나 암종/일반 암 범위 불명확 |
| 제목은 ‘림프종 관리’이고 claim은 해당 사례를 계속 지칭하며 “이 아이에게 후코이단을 먹였다.” | `lymphoma` | 제목과 claim 사이의 지시 관계가 명확 |
| 제목은 ‘반려견 암 정보’이고 claim은 “진단 후 보충제를 먹였다.” | `unspecified` | 제목만으로 claim의 적용 범위를 확정할 수 없음 |

요약 규칙은 다음과 같다.

> **암 전반이라고 말했으면 `general_cancer`; 암 관련인 것은 알지만 무엇을 대상으로 말하는지 신뢰성 있게 알 수 없으면 `unspecified`.**

## 4. Evidence relationship (`evidence`)

`evidence`는 **claim의 핵심 명제가 현행 수의영양·수의종양 진료 원칙 및 근거와 맺는 관계**를 분류하는 변수이며, 임상 위험도 자체가 아니다. 먼저 `evidence_applicability`를 판정하고, 적용 가능한 claim에 E0–E5 중 가장 적절한 코드 하나를 부여한다.

| 코드 | 범주 | 정의 | 대표 판정 단서 |
|---|---|---|---|
| `E0` | Evidence-consistent | 핵심 명제가 적용 가능한 E0 reference principle과 대체로 부합하고, 주장 강도에 필요한 근거가 있으며, 중요한 제한이 함께 제시됨 | 적정 섭취·체중/근육 유지·개별화·균형·모니터링·안전성 원칙을 정확한 범위에서 설명 |
| `E1` | Overgeneralized | 일부 상황에서 가능한 조언을 모든 암 환자에게 보편화 | “모든 암 환자는 반드시…” |
| `E2` | Context omitted | 암종, 치료단계, 섭취량, 체중, 동반질환, 조리·식품안전, 식단 균형 등 핵심 맥락이 빠짐 | 조건 없는 일반 조언이나 레시피 제시 |
| `E3` | Unsupported therapeutic claim | 종양 축소, 항암, 완치, 생존 연장 등 치료효과를 주장하지만 개·고양이 임상 근거가 충분하지 않음 | “이 성분이 암을 줄인다” |
| `E4` | Misleading or evidence-conflicting | 알려진 권고와 충돌하거나, 근거를 선택적으로 제시해 보호자를 오도할 가능성이 큼 | 금기/안전성 경고를 무시한 단정 |
| `E5` | High-risk misinformation | 표준치료 회피·지연, 극단적 식이 제한, 면역저하 환자의 식품안전 위험, 고용량/상호작용 미공개 보충제, 수의사 불신을 직접 유도 | “항암 대신 이것만”, “병원 치료는 하지 마라” |
| `not_applicable_out_of_scope` | Not applicable | 영양 claim이 아니거나 evidence 관계를 평가하는 분석 범위 밖 | 관련성/적격성 단계에서 제외 |
| `not_assessable` | Not assessable | 암·영양 관련성은 있으나 핵심 명제 또는 필수 문맥이 부족해 신뢰성 있는 E0–E5 판정이 불가능 | 전사 누락, 잘린 문장, 지시 대상 불명 |

### 4.1 `evidence_applicability`

E0–E5를 부여하기 전에 다음 중 하나를 선택한다.

| 코드 | 정의 | `evidence` 처리 |
|---|---|---|
| `applicable` | 개·고양이 암/종양 영양과 관련된 사실적·인과적·권고적 핵심 명제가 식별되고, 근거 관계를 평가할 최소 문맥이 있음 | E0–E5 중 하나 코딩 |
| `not_applicable_out_of_scope` | 영양 claim이 아니거나 분석 범위 밖이라 evidence 평가 대상이 아님 | `not_applicable_out_of_scope` |
| `not_assessable` | 암·영양 관련성은 확인되지만 핵심 명제, 대상, 방향 또는 문맥이 부족해 평가 불가 | `not_assessable` |

**적용 규칙:** 단순한 질문, 감정 표현, 제품명 나열, 개인 경험의 서술만 있고 일반화 가능한 효과·안전·권고 명제가 없으면 evidence를 억지로 E0–E5에 넣지 않는다. 반대로 경험담이 “그러므로 이 제품은 암에 효과가 있다”로 일반화되면 `applicable`로 전환해 핵심 명제를 평가한다.

### 4.2 `core_claim_evidence`

`core_claim_evidence`는 “수의사와 상담”, “개체마다 다름”, “보조적으로 사용” 같은 modifier를 잠시 제거하고 **개입 X가 결과 Y를 만든다는 핵심 명제 자체**의 근거 상태를 코딩한다.

| 코드 | 정의 |
|---|---|
| `supported` | 주장 강도와 대상에 부합하는 개·고양이 임상 근거 또는 확립된 수의영양·종양 진료 원칙이 있음 |
| `partially_supported` | 제한된 조건·간접 근거에서는 가능하지만 현재 표현의 범위·강도를 모두 지지하지 못함 |
| `unsupported` | 치료·예방·생존 등 핵심 효과를 뒷받침할 충분한 개·고양이 근거가 없음 |
| `evidence_conflicting` | 현행 권고 또는 신뢰 가능한 근거와 충돌함 |
| `not_applicable_out_of_scope` | evidence 평가 대상이 아님 |
| `not_assessable` | 핵심 명제 또는 필요한 문맥을 식별할 수 없음 |

**veterinary consultation override 금지:** 핵심 명제가 `unsupported` 또는 `evidence_conflicting`이면 “담당 수의사와 상의하세요”가 붙어 있어도 E0가 될 수 없다. 해당 문구는 `risk_modifier = veterinary_consultation_advice`와 `risk_modifier_direction = risk_reducing`으로 기록할 수 있지만, `core_claim_evidence`와 `evidence`는 핵심 명제에 따라 E3–E5 또는 E4로 판정한다.

### 4.3 `e0_reference_principle`

E0는 “명백히 위험하지 않음”을 뜻하는 잔여 범주가 아니라 **확인 가능한 양성(positive) reference principle에 부합하는 claim**이다. E0를 부여할 때 아래 원칙을 하나 이상 기록한다. 다중값을 허용한다.

| 코드 | E0 reference principle |
|---|---|
| `adequate_energy_and_nutrient_intake` | 환자의 실제 섭취량과 충분한 에너지·영양 섭취를 우선한다 |
| `weight_muscle_and_body_condition_preservation` | 체중, 근육량, body/muscle condition의 보존·모니터링을 중시한다 |
| `individualized_nutrition_assessment` | 암종, 치료단계, 증상, 선호도, 동반질환, 현재 식단을 바탕으로 개별화한다 |
| `complete_and_balanced_diet` | 장기 급여 식단의 영양적 완전성과 균형을 확보한다 |
| `symptom_adapted_supportive_feeding` | 오심, 구토, 설사, 구강통증, 식욕저하 등에 맞춰 섭취를 지지한다 |
| `food_safety_and_hygiene` | 면역저하 환자와 가정의 병원체 노출을 줄이는 식품안전·위생을 적용한다 |
| `supplement_disclosure_dose_and_interaction_review` | 모든 보충제의 성분·용량·품질·약물 상호작용을 검토하고 의료진에게 공개한다 |
| `monitoring_and_reassessment` | 체중, 섭취량, 증상, 치료 반응을 지속적으로 모니터링하고 계획을 재평가한다 |
| `nutrition_as_support_not_treatment_replacement` | 영양관리를 지지치료로 사용하며 근거 기반 종양치료를 대체하지 않는다 |
| `other_specified` | 다른 확립 원칙. 구체적 원칙과 근거 출처를 자유기술로 기록 |
| `none_identified` | 적용 가능한 양성 reference principle이 확인되지 않음. E0 부여 불가 |
| `not_applicable_out_of_scope` | evidence 평가 대상이 아님 |
| `not_assessable` | 문맥 부족으로 원칙을 판정할 수 없음 |

#### E0 양성 판정의 필수 조건

E0는 다음을 **모두** 만족할 때만 부여한다.

1. `evidence_applicability = applicable`이다.
2. `core_claim_evidence = supported`이다.
3. `e0_reference_principle`이 하나 이상 확인되며 `none_identified`가 아니다.
4. claim의 강도와 범위가 근거의 강도와 범위를 초과하지 않는다.
5. 결과를 바꿀 수 있는 중요한 대상·치료·섭취·동반질환·안전성 맥락이 적절히 제시된다.
6. E0를 배제하는 `e0_red_flag`가 없다.

“잘 모르겠다”, “명백히 틀렸다고 말할 수 없다”, “수의사가 말했다”는 E0의 양성 근거가 아니다. 판단이 불가능하면 `not_assessable`, 제한적 근거를 과도하게 확장하면 E1–E3을 검토한다.

### 4.4 `e0_red_flag`

다음 단서가 있으면 E0를 자동 부여하지 않고 E1–E5를 우선 검토한다. 다중값을 허용한다.

- `therapeutic_or_cure_claim`
- `tumor_shrinkage_or_survival_claim`
- `universal_or_absolute_language`
- `standard_treatment_replacement_or_delay`
- `human_other_animal_or_in_vitro_extrapolation`
- `missing_material_context`
- `extreme_restriction_or_inadequate_intake_risk`
- `raw_food_in_immunocompromised_context`
- `supplement_dose_quality_or_interaction_concern`
- `anti_veterinary_or_conspiracy_framing`
- `commercial_claim_without_verifiable_support`
- `none_identified`
- `not_applicable_out_of_scope`
- `not_assessable`

**결정 규칙:** `e0_red_flag`는 최종 evidence code 그 자체가 아니다. 예를 들어 치료효과 표현이 있어도 충분한 직접 근거와 정확한 제한이 있다면 전문가 검토 후 판정할 수 있다. 그러나 red flag를 단순한 상담 권고 문구로 상쇄해서는 안 된다.

### 4.5 Evidence 결정 규칙과 `evidence_source_type`

#### Evidence 결정 규칙

1. `E0`는 단순히 수의사/병원 채널이라는 이유로 부여하지 않는다. claim의 핵심 내용, 적용 가능한 reference principle, 주장 강도와 제한 조건을 평가한다.
2. E0–E5는 상호 배타적으로 기록한다. 복합 claim은 가능한 분리하고, 분리할 수 없으면 가장 심각한 코드를 사용한다.
3. 단순 정보 나열로 치료 효과가 명시·암시되지 않으면 E0를 자동 부여하지 않는다. `evidence_applicability`, `core_claim_evidence`, E0 양성 조건을 순서대로 확인한다.
4. “치료 보조”라는 표현도 종양 축소·완치·생존 연장을 보장/암시하면 E3 이상을 검토한다.
5. 판단 근거는 `evidence_rationale`에 1–3문장으로 기록하고, 근거 문헌/가이드라인은 `evidence_source`에 기록한다.
6. 사람 대상 연구, 다른 동물 연구, 세포실험, 기전 설명만으로 개·고양이 치료효과를 확정할 수 없다. 이러한 근거를 개·고양이의 종양 축소·생존 연장으로 직접 일반화하면 E3 이상을 검토한다.
7. 한 영상이 위험한 주장을 소개한 뒤 반박할 수 있으므로, evidence는 영상 전체가 아니라 분리된 claim과 `claim_orientation`을 기준으로 판정한다.
8. 상담 권고·면책·조건 문구는 `risk_modifier`에 별도 코딩한다. 이 문구가 핵심 명제의 `unsupported` 또는 `evidence_conflicting` 상태를 E0로 변경하지 않는다.
9. `evidence_applicability = not_applicable_out_of_scope`이면 `evidence = not_applicable_out_of_scope`; `evidence_applicability = not_assessable`이면 `evidence = not_assessable`로 일치시킨다.

#### `evidence_source_type`

다중값 허용. 이 변수는 근거의 존재 여부와 출처를 기술할 뿐, 그 자체로 evidence code를 결정하지 않는다.

| 코드 | 정의 |
|---|---|
| `companion_animal_clinical_study` | 개·고양이 대상 임상 연구·증례군·임상 가이드라인을 인용 |
| `other_animal_study` | 설치류 등 개·고양이 이외 동물 연구를 인용 |
| `human_clinical_study` | 사람 대상 임상 연구·가이드라인을 인용 |
| `in_vitro_or_mechanistic` | 세포·조직·분자 기전 또는 시험관 연구를 인용 |
| `expert_opinion_or_anecdote` | 전문가 의견, 개인 경험, 비체계적 사례만 제시 |
| `citation_not_verifiable` | 논문·기관을 언급하지만 확인 가능한 출처가 없음 |
| `no_evidence_presented` | 근거 언급이 없음 |
| `unclear` | 전사/맥락 부족으로 판단 불가 |

#### 통합 판정 예시

| Claim | `core_claim_evidence` | 주요 보조 코드 | `evidence` |
|---|---|---|---|
| “암 치료 중에는 섭취량과 체중·근육량을 정기적으로 확인하고, 식욕이 떨어지면 환자 상태에 맞춰 급여 계획을 조정해야 한다.” | `supported` | `adequate_energy_and_nutrient_intake; weight_muscle_and_body_condition_preservation; monitoring_and_reassessment`, red flag 없음 | `E0` |
| “후코이단이 종양을 줄일 수 있으니 급여해 보되 담당 수의사와 상담하세요.” | `unsupported` | `veterinary_consultation_advice`, `therapeutic_or_cure_claim` | `E3` 이상 검토. 상담 문구로 E0 불가 |
| “모든 암 환자는 탄수화물을 완전히 끊어야 한다.” | `partially_supported` 또는 `evidence_conflicting` | `universal_or_absolute_language; extreme_restriction_or_inadequate_intake_risk` | `E1`, `E4` 또는 위해 맥락에 따라 `E5` |
| “항암치료 대신 이 보충제만 먹이면 된다.” | `unsupported`/`evidence_conflicting` | `standard_treatment_replacement_or_delay` | `E5` |
| 전사문이 “이걸 먹이면 좋아져요”만 남고 대상·결과가 식별되지 않음 | `not_assessable` | `not_assessable` | `not_assessable` |

## 5. 영양 주장 기전·방향과 misinformation theme

`nutrition_claim_mechanism`은 **무엇을 주장하는지**를 중립적으로 기록하고, `misinformation_theme`은 그 주장의 **문제되는 서술 방식 또는 오류 기제**를 기록한다. 따라서 영양 주제가 있다는 이유만으로 misinformation theme을 부여하지 않는다.

### 5.1 `nutrition_claim_mechanism` (다중값 허용)

| 코드 | 정의 | 예시 |
|---|---|---|
| `micronutrient_repletion_or_deficiency` | 특정 비타민·미네랄 부족 보충 또는 결핍 교정 주장 | 마그네슘·비타민 D 보충 |
| `immunomodulation_or_microbiome` | 면역세포, 장내미생물, 프리·프로·포스트바이오틱스의 조절 주장 | 장내미생물 균형과 면역 |
| `antioxidant_or_oxidative_stress` | 항산화제, 활성산소, 산화스트레스의 치료·보조 역할 주장 | 항산화제와 항암제 병용 |
| `macronutrient_or_metabolic_management` | 단백질·지방·탄수화물·케톤식·에너지 대사 조절 주장 | 고단백/저탄수 식이 |
| `nutrition_support_or_intake_management` | 식욕, 강제급여, 열량, 체중·근육량, 악액질 관리 주장 | 수술 후 분할 급여 |
| `food_ingredient_safety_or_carcinogenicity` | 특정 원료·보존제·식품이 암/독성을 유발하거나 안전하다고 주장 | 합성 보존제와 암 위험 |
| `raw_food_or_food_safety` | 생식·비가열 식품·병원체 안전성을 다룸 | 면역저하 환자의 생식 급여 |
| `product_potency_or_selection` | 제품 성분·함량·제형·가격·브랜드 간 효능/선택 비교 | 베타글루칸 함량 비교 |
| `other_specified` | 위 코드로 포착되지 않는 기전. 자유기술 필수 | 기타 명시된 영양 기전 |
| `not_applicable_out_of_scope` | 영양 claim이 아닌 콘텐츠 | evidence 평가 범위 밖 |
| `not_assessable` | 전사·화면·맥락 부족으로 주장 기전을 판정할 수 없음 | 핵심 발화가 잘린 전사문 |

### 5.2 `claim_orientation`

| 코드 | 정의 | 적용 예 |
|---|---|---|
| `endorsed` | 발화자가 claim을 사실·권고로 제시 | “이 성분을 먹이면 도움이 된다” |
| `corrective` | 잘못된 claim을 명시적으로 반박·교정 | “탄수화물을 무조건 끊으면 안 된다” |
| `cautious_qualified` | 가능성을 언급하되 용량·상태·상담 등 제한을 강조 | “병용 전 수의사와 확인해야 한다” |
| `commercial_promotional` | 제품 선택·구매·가격·브랜드를 중심으로 claim을 강화 | “이 제품이 더 강하고 가성비가 좋다” |
| `descriptive_neutral` | 정보 소개이지만 권고·판단 방향이 분명하지 않음 | 영양소의 일반적 역할 설명 |
| `unclear` | 전사 또는 맥락 부족 | 발화 방향을 확인할 수 없는 일부 전사 |

**결정 규칙:** 영상을 통해 잘못된 theme가 언급되더라도 `corrective`이면 그 theme을 기록한다. 예를 들어 “탄수화물을 모두 끊어야 한다”는 생각을 반박하는 영상은 `carbohydrate_sugar_absolutism + corrective`로 기록한다. 이 경우 evidence는 해당 교정 claim을 기준으로 별도 판정한다.

### 5.3 `misinformation_theme` (다중값 허용)

`misinformation_theme`은 E1–E5 claim 또는 교정 대상으로 명시된 misinformation에 적용한다. 주제만 존재하고 문제되는 framing이 확인되지 않으면 `none_identified`를 사용한다.

| 코드 | 정의 | 대표 paraphrase |
|---|---|---|
| `carbohydrate_sugar_absolutism` | 탄수화물/당을 암의 직접 원인 또는 보편적 금기처럼 단정 | “암을 굶기려면 탄수화물은 모두 끊어야 한다” |
| `universal_cancer_diet` | 특정 식단을 모든 암 환자에게 필수/최선으로 일반화 | “모든 암 환자는 이 식단을 먹어야 한다” |
| `raw_natural_diet_as_immune_therapy` | 생식·자연식이 면역을 높여 암 치료에 도움이 된다고 주장 | “생식이 항암 중 면역을 올린다” |
| `supplement_as_anti_cancer_therapy` | 보충제를 항암제·종양 축소 치료처럼 제시 | “후코이단이 종양을 줄인다” |
| `detox_or_alkaline_pseudoscience` | 해독·알칼리화가 암을 치료한다고 제시 | “해독하면 암이 낫는다” |
| `immune_enhancement_as_cancer_therapy` | 면역 증진만으로 암을 예방·치료·재발 억제한다고 단정 | “면역을 올리면 암을 막을 수 있다” |
| `homemade_cooked_diet_superiority` | 화식·수제식·집밥이 사료보다 무조건 우월하다고 주장 | “사료는 나쁘고 집밥만 정답이다” |
| `anti_veterinary_framing` | 수의사/표준 치료의 악의적 은폐·무용성을 주장 | “수의사는 자연치료를 숨긴다” |
| `commercialized_vague_health_claim` | 근거 수준이 불명확한 ‘항암·면역·종양 억제’ 상업 문구 | “항암 면역 사료” |
| `commercial_product_potency_or_selection_claim` | 제품의 성분·함량·제형·가격을 치료적 효능의 서열로 연결하며 구매를 유도 | “이 제품은 다른 제품보다 8배 강해 암 환자에게 더 낫다” |
| `ingredient_carcinogenicity_or_natural_safety_framing` | 특정 식품/사료 성분이 암을 유발한다고 단정하거나 ‘천연’ 원료를 본질적으로 안전하다고 일반화 | “합성 보존제는 암을 만들고 천연 보존제는 안전하다” |
| `single_nutrient_or_ingredient_therapeutic_effect` | 특정 영양소·성분 하나가 종양 성장, 재발, 생존, 치료 효과를 직접 좌우한다고 제시 | “이 영양소가 생존기간을 늘린다” |
| `antioxidant_chemotherapy_interaction_claim` | 항산화제가 항암 효율·종양세포 사멸·생존을 일관되게 높이거나 낮춘다고 일반화 | “항산화제는 항암 효과를 높인다” |
| `none_identified` | 위 theme가 확인되지 않음 | 문제되는 framing이 없는 지지영양 원칙 설명 |
| `not_applicable_out_of_scope` | 관련성 선별에서 제외된 영상/claim이므로 theme을 평가하지 않음 | 영양 claim이 아닌 발화 |
| `not_assessable` | 전사·화면·문맥이 불충분하여 theme을 판정할 수 없음 | 핵심 문장이 누락된 전사문 |

**적용 순서:** `relevance_status` → `claim_eligibility` → `nutrition_claim_mechanism` → `claim_orientation` → `evidence_applicability` → `core_claim_evidence` → `evidence_source_type` → `e0_reference_principle`/`e0_red_flag` → `evidence` → `misinformation_theme` → `risk_modifier` → `risk` 순으로 코딩한다. 빈값은 사용하지 않는다.

## 6. 임상 위험 번역

### 6.1 `risk_domain` (다중값 허용)

| 코드 | 정의 |
|---|---|
| `nutritional_imbalance` | 불균형 수제식, 미량영양소 결핍, 레시피 균형 부재 |
| `inadequate_intake_cachexia` | 불필요한 제한·식단 변경으로 섭취량·체중·근육량 저하 위험 |
| `delayed_or_refused_treatment` | 식이/보충제를 표준치료의 대체재로 사용하거나 상담을 지연할 위험 |
| `unsafe_supplement_use` | 고용량, 약물 상호작용, 제품 품질, disclosure 부족 |
| `food_safety_risk` | 생식/비가열 식품에 따른 병원체 노출 위험 |
| `veterinary_mistrust` | 수의사 상담 회피·치료 계획 불신 유도 |
| `financial_decision_burden` | 고가 제품, 죄책감, 불필요한 비용·의사결정 부담 |
| `none_identified` | 구체적 임상 위험이 확인되지 않음 |
| `unclear` | 맥락 부족 |

### 6.2 `risk_level`

| 코드 | 정의 | 예시 |
|---|---|---|
| `low` | 과장·모호함은 있으나 직접적인 위해 가능성이 낮음 | 범위가 불명확한 건강 홍보 |
| `moderate` | 불필요한 식단 변경, 비용 낭비, 영양 불균형 또는 상담 지연 가능성 | 균형 설명 없는 수제식 권장 |
| `high` | 치료 지연, 생식 감염 위험, 극단적 제한식, 보충제 오남용, 수의사 불신 가능성 | 항암 중 생식 권장, 보충제 병용 확인 누락 |
| `critical` | 즉각적인 표준치료 거부/중단을 직접 유도 | “항암 대신 이것만 하라” |
| `not_assessable` | claim이 영양 관련이 아니거나 맥락이 없어 위험을 평가할 수 없음 | 대상·개입·결과가 식별되지 않는 발화 |

### 6.3 `risk_modifier`

`risk_modifier`는 핵심 claim의 사실성·근거 상태가 아니라, 해당 claim이 실제 행동으로 이어질 때 위해를 낮추거나 높일 수 있는 표현·조건을 기록한다. 다중값을 허용한다.

| 코드 | 통상 방향 | 정의 |
|---|---|---|
| `veterinary_consultation_advice` | risk-reducing | 담당 수의사·전문가와 상의하도록 명시 |
| `individualization_or_patient_specific_limit` | risk-reducing | 환자별 상태·암종·치료·동반질환에 따라 달라짐을 명시 |
| `dose_duration_or_product_specification` | risk-reducing/mixed | 용량·기간·제품 규격을 제한. 근거 없는 정밀 수치는 risk-increasing 가능 |
| `interaction_or_contraindication_warning` | risk-reducing | 약물 상호작용·금기·부작용 경고 |
| `food_safety_warning` | risk-reducing | 조리·위생·면역저하 환자의 병원체 위험 경고 |
| `complete_and_balanced_diet_requirement` | risk-reducing | 장기 급여의 영양 균형 또는 전문 배합 필요성 명시 |
| `monitoring_or_stop_rule` | risk-reducing | 체중·섭취·증상 모니터링 및 중단/재평가 기준 제시 |
| `standard_treatment_continuation` | risk-reducing | 영양 개입이 표준치료를 대체하지 않음을 명시 |
| `standard_treatment_replacement_or_delay` | risk-increasing | 표준치료 중단·거부·지연을 권고·암시 |
| `absolute_or_universal_instruction` | risk-increasing | 모든 환자에게 예외 없이 적용하도록 지시 |
| `commercial_urgency_or_guarantee` | risk-increasing | 구매 긴급성·효과 보장·과장된 확실성으로 행동을 압박 |
| `anti_veterinary_mistrust` | risk-increasing | 수의사 또는 표준치료에 대한 불신·회피를 유도 |
| `none_identified` | none | 위해를 수정하는 명시적 표현이 없음 |
| `not_applicable_out_of_scope` | N/A | 분석 범위 밖 |
| `not_assessable` | unclear | 문맥 부족으로 판정 불가 |

**코딩 규칙:**

1. modifier의 존재는 `core_claim_evidence`와 독립적으로 코딩한다.
2. `veterinary_consultation_advice` 또는 다른 risk-reducing modifier가 있어도 근거 없는 치료효과 claim을 E0로 변경하지 않는다.
3. risk-reducing과 risk-increasing modifier가 함께 있으면 모두 기록하고 `risk_modifier_direction = mixed`로 한다.
4. 최종 `risk_level`은 핵심 claim, 대상 환자, 치료 맥락, 실행 가능성, modifier의 방향을 함께 고려해 결정하고 `risk_modifier_rationale`에 근거를 남긴다.
5. `risk_modifier = none_identified`는 검토 후 modifier가 없음을 뜻하며, `not_assessable`과 구분한다.

### 6.4 `clinical_translation`

고위험 또는 판단이 어려운 claim에는 다음 세 변수를 추가한다.

| 변수 | 정의 |
|---|---|
| `screening_question` | 진료실에서 보호자에게 물을 확인 질문. 해당 없음은 `NA_not_applicable`, 작성 불가는 `not_assessable` |
| `counseling_priority` | 상담에서 먼저 다룰 위험/메시지. 해당 없음은 `NA_not_applicable`, 작성 불가는 `not_assessable` |
| `expert_review_required` | `true`/`false`. `high`, `critical`, E5, E0 red flag 불일치, 또는 판정 불일치 claim은 `true` |

예: 탄수화물 완전 제한 claim → `nutritional_imbalance; inadequate_intake_cachexia` → “암 진단 후 사료나 탄수화물을 제한하셨나요?” → 체중·근육량·섭취량 기반 개별화 설명.

## 7. 발화자 유형과 상업성

### 7.1 `actor_type`

| 코드 | 정의 |
|---|---|
| `veterinarian_clinic` | 수의사, 동물병원, 수의학 기반 채널 |
| `caregiver` | 보호자 경험담 중심 채널 |
| `influencer_content_creator` | 일반 반려동물 크리에이터/인플루언서 |
| `pet_nutritionist_trainer` | 비수의 영양상담가, 훈련사, 자연식 전문가 |
| `commercial_seller_affiliate` | 직접 판매, 제휴, 브랜드 판매가 채널의 주목적 |
| `media_curated_channel` | 뉴스·방송·정보 큐레이션 채널 |
| `unclear` | 판단 불가 |

`actor_type`은 자격·근거 수준의 대리변수가 아니다. 수의사/병원 채널도 commercial 코딩과 evidence 코딩을 독립적으로 수행한다.

### 7.2 `contains_commercial_content`

| 코드 | 정의 |
|---|---|
| `true` | 영상/설명/고정 댓글에 판매·제휴·구매 유도·제품 홍보 중 하나가 확인됨 |
| `false` | 검토한 범위에서 상업성 신호가 확인되지 않음 |
| `unclear` | 설명란 접근 불가, 링크가 해석 불가 등으로 판단할 수 없음 |

### 7.3 `commercial_type` (다중값 허용)

- `direct_product_sale`
- `clinic_service_promotion`
- `affiliate_or_referral_link`
- `brand_sponsorship_or_paid_partnership`
- `discount_coupon_or_purchase_link`
- `product_name_or_brand_mention_only`
- `membership_or_donation`
- `other`
- `none`
- `unclear`

`commercial_evidence`에는 링크·할인 코드·구매 문구·제품명 등 확인 가능한 근거를 저장한다. `true`에는 최소 하나의 `commercial_type`과 근거가 필수다. `false`에는 `commercial_type = none`, `commercial_evidence = none_identified`를 기록한다. 판단 불가 시 두 변수 모두 `unclear`를 사용하며 빈값을 두지 않는다.

## 8. 댓글 stance와 행동 반응

### 8.1 `stance`

댓글이 연결된 claim에 대해 보이는 태도를 하나 선택한다. 상업성과 지지성이 함께 강하면 `commercial_promotional`을 우선하고, 개인 경험으로 지지하면 `anecdotal_supportive`를 우선한다.

| 코드 | 정의 | 예시 |
|---|---|---|
| `supportive` | claim을 직접 지지·추천 | “정말 도움이 되는 방법입니다” |
| `anecdotal_supportive` | 본인/반려동물의 경험을 근거로 claim을 강화 | “우리 아이에게 먹였더니 좋아졌어요” |
| `commercial_promotional` | 제품 구매·판매·제휴·링크 홍보로 claim을 강화 | “여기서 구매하세요” |
| `cautious_qualified` | 조건·용량·부작용·개별 상담을 언급 | “항암 중이면 담당 수의사와 확인해야 합니다” |
| `corrective` | claim의 오류를 바로잡거나 근거 기반 정보를 제시 | “모든 암 환자에게 적용되는 것은 아닙니다” |
| `anti_clinical` | 수의사/표준치료 불신 또는 회피를 권장 | “병원 말은 믿지 마세요” |
| `neutral_unclear` | 인사, 감정 표현, 핵심 claim과 무관, 해석 불가 | “감사합니다” |

### 8.2 `comment_action` (다중값 허용)

- `purchase_intent_or_access_question`
- `purchase_or_price_discussion`
- `feeding_or_use_intent`
- `reported_feeding_or_use`
- `treatment_decision_or_delay_discussion`
- `request_for_clinical_advice`
- `request_for_evidence_or_source`
- `safety_or_dose_question`
- `emotional_support_only`
- `none_identified`
- `unclear`

댓글의 단어만으로 실제 구매·급여·치료 중단을 확정하지 않는다. “구매하고 싶다”, “먹이고 있다”처럼 명시된 내용만 행동 의향/자기보고로 기록한다.

## 9. 코딩 절차와 품질 관리

1. **관련성 선별:** 2명의 훈련된 코더가 독립적으로 video-level `relevance_status`를 코딩한다.
2. **Claim 추출:** 적격 영상에서 후보 claim을 추출하고, 가능한 경우 개입–결과의 핵심 명제와 안전·상담 modifier를 구분한다. LLM은 후보 추출·중복 묶기 보조에만 사용하고, 최종 적격성·evidence·risk 판정은 사람이 수행한다.
3. **Evidence 적용성:** `evidence_applicability`를 먼저 판정한다. `not_applicable_out_of_scope`와 `not_assessable`을 E0로 처리하지 않는다.
4. **핵심 명제와 E0 기준:** `core_claim_evidence`를 판정한 뒤 E0 후보에 대해 `e0_reference_principle`과 `e0_red_flag`를 기록한다. E0 양성 조건을 모두 충족하지 않으면 E0를 부여하지 않는다.
5. **Risk modifier 분리:** 상담 권고, 제한 조건, 상호작용 경고, 치료 대체 문구를 `risk_modifier`로 독립 코딩한다. modifier는 evidence code를 덮어쓰지 않는다.
6. **Evidence와 risk 확정:** evidence는 핵심 명제의 근거 관계로, risk는 실제 위해 가능성과 modifier를 포함한 임상 맥락으로 각각 판정한다.
7. **Pilot:** 30–50개 claim과 댓글 30–50개를 사용해 v2.2 pilot을 수행한다. 특히 E0 양성 판정, `none_identified`, `not_applicable_out_of_scope`, `not_assessable`, `corrective`, `general_cancer`/`unspecified`, consultation override 금지의 경계를 사전 점검하고, 불일치와 새 사례는 `decision_log`에 기록한다.
8. **Double coding:** 전체 claim의 최소 20–30%와 고노출 영상 댓글의 최소 20–30%를 독립 이중 코딩한다. E0 후보와 E5 claim은 표본 비율과 무관하게 우선 이중 코딩한다.
9. **신뢰도:** `nutrition_claim_mechanism`, `claim_orientation`, `evidence_applicability`, `core_claim_evidence`, `e0_reference_principle`, `e0_red_flag`, `evidence_source_type`, `evidence`, `misinformation_theme`, `risk_modifier`, `risk_level`, `actor_type`, `stance`에 Cohen’s kappa 또는 Krippendorff’s alpha를 보고한다. 다중값 변수는 사전 정의한 일치 규칙을 함께 제시한다.
10. **전문가 검토:** E5, `high/critical`, 표준치료 대체 claim, 생식 안전성, 보충제 상호작용 관련 claim, E0 red flag가 있는 E0 후보는 수의종양·수의영양 전문가 검토를 받는다.

### 9.1 LLM guardrails

LLM은 자료 검색의 권위 있는 근거원이나 최종 코더가 아니라 **후보 추출과 구조화 보조도구**로 사용한다.

1. LLM은 `claim_text`에 없는 개입, 결과, 암종, 치료단계, 제한 조건, 문헌을 생성하거나 추정해서는 안 된다.
2. `cancer_specificity`는 명시적 문맥만 사용한다. 특정 암종명이 없다는 이유만으로 `general_cancer`를 부여하지 않으며, 범위를 결정할 수 없으면 `unspecified`를 제안한다.
3. E0는 기본값이나 “안전한” 잔여 범주가 아니다. LLM은 E0를 제안할 때 `core_claim_evidence = supported`, 하나 이상의 `e0_reference_principle`, `e0_red_flag = none_identified`, 구체적 `evidence_rationale`을 함께 출력해야 한다.
4. “수의사와 상담”, “개체마다 다름”, “보조제로만 사용” 문구만으로 E0를 제안해서는 안 된다. 이 문구는 `risk_modifier`로 분리한다.
5. 근거 출처를 제시하지 않은 콘텐츠에 논문이나 가이드라인을 임의로 귀속하지 않는다. 확인할 수 없으면 `no_evidence_presented`, `citation_not_verifiable` 또는 `unclear`를 사용한다.
6. 사람·설치류·세포 연구를 개·고양이 임상근거로 승격하지 않는다. 종과 연구 설계를 `evidence_source_type`에 그대로 기록한다.
7. 정보가 부족하면 빈값이나 추측 대신 변수별 `not_assessable`, `unclear`, `unspecified`, `NA_not_applicable`, `NA_not_available` 중 정의에 맞는 값을 출력한다.
8. LLM 제안에는 원문 span 또는 timestamp를 반드시 연결한다. 근거 span이 없는 값은 사람 코더가 채택하지 않는다.
9. LLM은 최종 `evidence`, `risk_level`, `expert_review_required`를 확정하지 않는다. 모든 E0, E5, `high/critical`, consultation override 가능 사례는 사람 검토가 필수다.
10. 프롬프트·모델·버전·실행일과 LLM 원출력을 감사 가능한 형태로 보존하고, human gold-standard subset에서 precision, false-positive pattern, missed claim pattern을 평가한다.

### 9.2 권장 판정 기록 순서

각 claim에 대해 다음 질문에 순서대로 답한다.

1. 원문에서 독립적으로 검증 가능한 영양 핵심 명제가 있는가?
2. evidence 평가가 `applicable`, `not_applicable_out_of_scope`, `not_assessable` 중 무엇인가?
3. modifier를 제거한 핵심 명제의 근거 상태는 무엇인가?
4. E0 후보라면 어떤 양성 reference principle에 부합하며 red flag가 없는가?
5. 핵심 명제의 evidence code는 무엇인가?
6. 어떤 modifier가 위험을 낮추거나 높이는가?
7. 최종 임상 risk domain과 level은 무엇인가?
8. 전문가 검토 또는 adjudication이 필요한가?

## 10. 결측·다중값·보고 규칙

- **빈값은 사용하지 않는다.** 구조적 비적용은 `NA_not_applicable`, 원자료 미제공·미수집은 `NA_not_available`, 검토 결과 없음은 `none_identified`, 정보 부족으로 판정 불가는 변수별 `not_assessable`, `unclear` 또는 `unspecified`를 사용한다.
- `NA_not_applicable`은 해당 변수가 논리적으로 적용되지 않음을 뜻한다. `NA_not_available`은 적용 대상이지만 플랫폼·수집·접근 문제로 원자료가 없음을 뜻한다.
- `none_identified`는 충분히 검토했으나 해당 항목이 확인되지 않았음을 뜻하며, `not_assessable`과 다르다.
- `unspecified`는 암 관련성 또는 치료 관련성은 확인되었으나 세부 범주를 신뢰성 있게 특정할 수 없는 코딩 상태다. 이는 `general_cancer`와 다르며 빈값이 아니다.
- 기존 시스템이 `NA`만 허용하면 원자료 단계에서 사유 변수를 병행하고, 분석 데이터셋 생성 시 `NA_not_applicable`과 `NA_not_available`을 구분해 매핑한다.
- 다중값은 세미콜론(`;`)으로 저장하거나 별도 long-format 연결 테이블을 사용한다. 논문 분석에는 가능하면 long format을 권장한다.
- 다중값 변수에서 `none_identified`, `not_applicable_out_of_scope`, `not_assessable`은 다른 실질 코드와 함께 저장하지 않는다. 단, 서로 반대 방향의 실질 `risk_modifier`는 함께 저장할 수 있고 방향은 `mixed`로 한다.
- 원문은 원자료에 보존하고, 보고서의 직접 인용은 최소화하며 `claim_paraphrase`를 우선 사용한다.
- 분석 결과는 전체 관련 표본과 고노출 관련 표본을 분리하여 제시한다. 조회수 가중 결과는 이상치에 민감하므로 영상 수 기준 결과와 병렬 보고한다.
- `pending_manual_review`, `uncertain`, `not_assessable`, `NA_not_available`은 최종 빈도표에서 별도로 보고하며, 무조건 제외하거나 E0로 간주하지 않는다.

## 11. 권장 출력표

1. Video sampling flow: 검색 → 중복 제거 → 수기 관련성 선별 → 최종 포함 → 고노출 층화
2. Claim taxonomy: intervention, outcome, `nutrition_claim_mechanism`, `claim_orientation`, evidence, theme, 대표 paraphrase, 빈도/비율
3. Evidence applicability table: `evidence_applicability` × `core_claim_evidence` × evidence
4. E0 reference table: `e0_reference_principle` × `e0_red_flag` × evidence, E0 양성 판정 일치율
5. Evidence-source table: `evidence_source_type` × evidence × claim strength
6. Risk matrix: theme × `risk_level`, `risk_domain` 및 `risk_modifier` 분포
7. Actor/commercial analysis: actor type × evidence, commercial type × evidence
8. Comment stance analysis: stance 및 `comment_action` 분포, 최상위 댓글/답글·소유자 답글 분리
9. Clinical translation matrix: claim pattern → core evidence → modifier → risk mechanism → screening question → counseling priority

