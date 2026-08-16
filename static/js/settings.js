// =========================
// SETTINGS PAGE
// =========================

document.addEventListener("DOMContentLoaded", () => {

    // =========================
    // COLOR PICKER
    // =========================

    const colorPicker = document.querySelector(
        'input[type="color"]'
    );

    const colorText = document.querySelector(
        '.color-box input[type="text"]'
    );

    if (colorPicker && colorText) {

        // Sync color picker to text

        colorPicker.addEventListener("input", () => {

            colorText.value = colorPicker.value;

        });

        // Sync text to color picker

        colorText.addEventListener("input", () => {

            colorPicker.value = colorText.value;

        });

    }

    // =========================
    // LOGO IMAGE PREVIEW
    // =========================

    const fileInput = document.getElementById(
        "logoInput"
    );

    const uploadBtn = document.querySelector(
        ".upload-btn"
    );

    const previewLogo = document.getElementById(
        "previewLogo"
    );

    if (fileInput && previewLogo) {

        fileInput.addEventListener("change", function () {

            const file = this.files[0];

            if (file) {

                // Change button text

                uploadBtn.innerHTML = `
                    <i class="fas fa-check"></i>
                    ${file.name}
                `;

                // Live image preview

                previewLogo.src =
                    URL.createObjectURL(file);

            }

        });

    }

    // =========================
    // SAVE BUTTON ANIMATION
    // =========================

    const saveBtn = document.querySelector(
        ".save-btn"
    );

    if (saveBtn) {

        saveBtn.addEventListener("click", () => {

            saveBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Saving...
            `;

        });

    }

});
// =========================
// FOOTER LOGO PREVIEW
// =========================

const footerLogoInput = document.getElementById(
    "footerLogoInput"
);

const footerLogoPreview = document.getElementById(
    "footerLogoPreview"
);

if (footerLogoInput) {

    footerLogoInput.addEventListener(
        "change",
        function(e) {

            const file = e.target.files[0];

            if (file) {

                footerLogoPreview.src =
                    URL.createObjectURL(file);

            }

        }
    );

}


// =========================
// ADMIN LOGO PREVIEW
// =========================

const adminLogoInput = document.getElementById(
    "adminLogoInput"
);

const adminLogoPreview = document.getElementById(
    "adminLogoPreview"
);

if (adminLogoInput) {

    adminLogoInput.addEventListener(
        "change",
        function(e) {

            const file = e.target.files[0];

            if (file) {

                adminLogoPreview.src =
                    URL.createObjectURL(file);

            }

        }
    );

}