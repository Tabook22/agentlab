# Omani plant recognition: document review and application proposal

Reviewed 30 October 2026. Source: Omani_Plant_Recognition_Complete_Student_Guide.docx, including its tables, diagrams, equations, and appendices. This is a design review; its training examples have not been executed on a GPU.

## Why the upload failed and what changed

The application previously rejected any source containing more than ten embedded images. Your latest document contains thirteen. Its text and images are valid; splitting this guide was unnecessary for this case.

The uploader now accepts illustrated Word files with up to 100 images within the existing file/archive size checks. It reads visual content in batches of four, displays coverage, keeps completed batches, and resumes unfinished content when retried with the same comments. Changing comments on an unfinished reading requires a fresh interpretation; previous reading charges remain recorded. All images must be covered before the source is ready for planning. Reading uses the configured OpenAI provider and incurs API usage; it does not start the workers or rent a GPU. Text is extracted locally first. Complex Word objects may still require a PDF copy, as explained in the source preview.

## My opinion

This is a strong foundation for a supervised student prototype. Its most valuable requirements are verified scientific names, stable individual-plant IDs, independent grouped test data, an original-model baseline, honest uncertainty, and documentary citations. Appendix B provides a particularly good first practical exercise: choose two species with an adviser, photograph different individuals, verify labels, and build a checked register before expanding the dataset.

Treat the proposed 10–20 species as a controlled scope, not coverage of all Omani flora. The guide's illustrated plants and sample records are teaching material, not a labelled training dataset. A low training loss or a successful ten-step smoke test does not establish botanical accuracy.

## Recommended first application

Build one bilingual React interface with a FastAPI backend and two clear areas:

1. **Identify a plant.** Upload or photograph a plant, optionally add region/season and another view. Display candidate species, features visible in the photo, limitations, and a request for better views when necessary. Keep factual species profiles tied to reviewed documents and page references. Do not invent confidence percentages.
2. **Student workspace.** Manage a species catalogue, photograph register, adviser review queue, grouped dataset splits, training jobs, and original-versus-adapter evaluations. Students can see what each stage produced and why the next checkpoint is locked.

A result should visibly separate “observed in your photo” from “supported by these references.” Add an expert correction action that creates a review item; it must not automatically turn a prediction into an approved training label.

## Build in this order

| Stage | Deliverable | Acceptance evidence |
|---|---|---|
| 1. Data preparation | Catalogue, photo register and adviser review | Every approved image has a canonical species ID, individual/group ID, reviewer and permission record |
| 2. Working baseline | Photo upload, original-model inference and cited reference answers | Real images work end to end; unclear and unsupported cases are handled; failed requests produce useful retry states |
| 3. Controlled training | Short smoke test, fresh pilot adapter and clean reload | Versioned manifests, settings, logs and saved processor/model revision |
| 4. Fair comparison | Baseline versus selected adapter | Same untouched test set; accuracy, macro F1, species errors, unknown handling and latency are measured |
| 5. Deployment | Protected model service and bilingual UI | Secret keys remain on backend; job progress, timeouts, recovery, backups and deployment checks work |

Start with two species as Appendix B suggests for the collection exercise, then expand after adviser review. Set an agreed performance target after inspecting the dataset and baseline; do not promise an accuracy figure before measuring it.

## Architecture and missing decisions

Suggested request path: browser → FastAPI validation → protected model service → canonical candidate validation → species-linked retrieval → response with evidence. Store image metadata/reviews in a database, originals in protected file storage, and source passages with document/page metadata. Training belongs in a separate job process; browser chat should not execute notebook cells.

The guide names Qwen3-VL-2B-Instruct as a starting candidate. Its official model card supports image-and-text use, but this review does not prove that the guide's precise Unsloth/TRL versions and settings work together. Pin and test one supported environment before a paid pilot. See the [Qwen model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct) and [Unsloth vision fine-tuning documentation](https://unsloth.ai/docs/basics/vision-fine-tuning).

Appendix A refers to a code package, worker and command instructions. The Word file alone is not evidence that those runnable assets are present. Supply the matching repository/notebooks, environment lock, sample manifest and deployment configuration before calling it a reproducible implementation. Export code as real scripts/notebooks: Word formatting can introduce nonbreaking spaces into indentation.

Decide authentication/student/adviser roles, approved source licences, data retention, coarse location handling, dataset versioning, job cancellation/recovery, and evaluation rules before deployment. Validate Arabic retrieval and interface direction explicitly. Local deployment requires local inference, embeddings and retrieval as well as a local screen.

Costs must be measured for the chosen GPU, data and service configuration. Separate training, inference, storage and document reading. RunPod workers can incur initialization and idle charges; scaling to zero introduces startup delay. See [RunPod worker lifecycle documentation](https://github.com/runpod/docs/blob/main/serverless/workers/overview.mdx). No GPU training or plant application deployment was performed during this review.

## Instructions to paste into AI Agent Lab

Read the attached Omani plant recognition guide, including its tables, diagrams and appendices. Evaluate it as a student project and propose a practical React + FastAPI application. Separate the plant identification experience from the student data/training workspace. Prioritize verified labels, individual-plant grouping, an original-model baseline, uncertain/unknown cases, Arabic and English, cited reference retrieval and adviser review. Distinguish what the guide supplies from missing code, data and deployment assets. Propose an MVP, phased work, success criteria, dependencies, costs and unresolved questions. Explain why each worker is needed. Treat example code as untested; do not run GPU jobs. Wait for my approval before worker execution.
