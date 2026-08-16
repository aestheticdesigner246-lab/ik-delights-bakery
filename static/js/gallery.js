/* =========================================================
   CSRF TOKEN
========================================================= */

function getCookie(name) {

    let cookieValue = null;

    if (document.cookie && document.cookie !== '') {

        const cookies = document.cookie.split(';');

        for (let i = 0; i < cookies.length; i++) {

            const cookie = cookies[i].trim();

            if (cookie.startsWith(name + '=')) {

                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );

                break;
            }
        }
    }

    return cookieValue;
}

/* =========================================================
   SHOW MODAL
========================================================= */

window.showGalleryModal = function () {

    const modal =
        document.getElementById(
            "galleryModal"
        );

    if (modal) {

        modal.style.display =
            "flex";
    }
};

/* =========================================================
   CLOSE MODAL
========================================================= */

window.closeGalleryModal = function () {

    const modal =
        document.getElementById(
            "galleryModal"
        );

    if (modal) {

        modal.style.display =
            "none";
    }
};

/* =========================================================
   CLOSE MODAL OUTSIDE CLICK
========================================================= */

window.addEventListener(
    "click",
    function (event) {

        const modal =
            document.getElementById(
                "galleryModal"
            );

        if (
            event.target === modal
        ) {

            modal.style.display =
                "none";
        }
    }
);

/* =========================================================
   LIGHTBOX
========================================================= */

const lightbox =
    document.querySelector(
        ".gallery-lightbox"
    );

const lightboxImage =
    document.querySelector(
        ".gallery-lightbox-image"
    );

const lightboxClose =
    document.querySelector(
        ".gallery-lightbox-close"
    );

/* =========================================================
   VIEW IMAGE
========================================================= */

document
    .querySelectorAll(
        ".gallery-view-btn"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const image =
                    this.closest(
                        ".gallery-card"
                    )
                    .querySelector(
                        ".gallery-image"
                    );

                if (
                    image &&
                    lightbox &&
                    lightboxImage
                ) {

                    lightboxImage.src =
                        image.src;

                    lightbox.style.display =
                        "flex";
                }
            }
        );
    });

/* =========================================================
   CLOSE LIGHTBOX
========================================================= */

if (lightboxClose) {

    lightboxClose.addEventListener(
        "click",
        function () {

            lightbox.style.display =
                "none";
        }
    );
}

/* =========================================================
   CLOSE LIGHTBOX OUTSIDE CLICK
========================================================= */

if (lightbox) {

    lightbox.addEventListener(
        "click",
        function (e) {

            if (e.target === lightbox) {

                lightbox.style.display =
                    "none";
            }
        }
    );
}

/* =========================================================
   CATEGORY FILTER
========================================================= */

const filterButtons =
    document.querySelectorAll(
        ".filter-btn"
    );

const galleryCards =
    document.querySelectorAll(
        ".gallery-card"
    );

filterButtons.forEach(button => {

    button.addEventListener(
        "click",
        function () {

            filterButtons.forEach(btn => {

                btn.classList.remove(
                    "active"
                );
            });

            this.classList.add(
                "active"
            );

            const filter =
                this.dataset.filter
                .trim()
                .toLowerCase();

            galleryCards.forEach(card => {

                const category =
                    card.dataset.category
                    .trim()
                    .toLowerCase();

                if (
                    filter === "all" ||
                    category === filter
                ) {

                    card.style.display =
                        "block";

                    setTimeout(() => {

                        card.style.opacity =
                            "1";

                        card.style.transform =
                            "translateY(0)";

                    }, 100);

                } else {

                    card.style.opacity =
                        "0";

                    card.style.transform =
                        "translateY(30px)";

                    setTimeout(() => {

                        card.style.display =
                            "none";

                    }, 250);
                }
            });
        }
    );
});

/* =========================================================
   DELETE CARD UI
========================================================= */

document
    .querySelectorAll(
        ".btn-delete"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const confirmDelete =
                    confirm(
                        "Delete this image?"
                    );

                if (confirmDelete) {

                    const card =
                        this.closest(
                            ".gallery-card"
                        );

                    card.style.opacity =
                        "0";

                    card.style.transform =
                        "scale(0.8)";

                    setTimeout(() => {

                        card.remove();

                    }, 300);
                }
            }
        );
    });

/* =========================================================
   EDIT BUTTON UI
========================================================= */

document
    .querySelectorAll(
        ".btn-edit"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const card =
                    this.closest(
                        ".gallery-card"
                    );

                const title =
                    card.querySelector(
                        ".gallery-title"
                    ).innerText;

                const category =
                    card.querySelector(
                        ".gallery-category"
                    ).innerText;

                const priceElement =
                    card.querySelector(
                        ".gallery-price"
                    );

                const price =
                    priceElement
                    ? priceElement.innerText.replace(
                        "Rs",
                        ""
                    )
                    : "";

                document.querySelector(
                    'input[name="name"]'
                ).value = title;

                document.querySelector(
                    'input[name="price"]'
                ).value = price;

                const categorySelect =
                    document.querySelector(
                        'select[name="category"]'
                    );

                for (
                    let option of
                    categorySelect.options
                ) {

                    if (
                        option.text
                        .trim()
                        .toLowerCase() ===
                        category
                        .trim()
                        .toLowerCase()
                    ) {

                        option.selected =
                            true;
                    }
                }

                window.showGalleryModal();
            }
        );
    });

/* =========================================================
   CARD ENTRY ANIMATION
========================================================= */

galleryCards.forEach((card, index) => {

    card.style.opacity =
        "0";

    card.style.transform =
        "translateY(40px)";

    setTimeout(() => {

        card.style.transition =
            "0.5s ease";

        card.style.opacity =
            "1";

        card.style.transform =
            "translateY(0)";

    }, index * 120);
});

/* =========================================================
   SAVE GALLERY IMAGE
========================================================= */

window.saveGalleryImage = async function () {

    const name =
        document.querySelector(
            'input[name="name"]'
        );

    const category =
        document.querySelector(
            'select[name="category"]'
        );

    const price =
        document.querySelector(
            'input[name="price"]'
        );

    const image =
        document.querySelector(
            'input[name="image"]'
        );

    if (
        !name.value ||
        !category.value ||
        !image.files[0]
    ) {

        alert(
            "Please fill all required fields"
        );

        return;
    }

    const formData =
        new FormData();

    formData.append(
        'name',
        name.value
    );

    formData.append(
        'category',
        category.value
    );

    formData.append(
        'price',
        price.value
    );

    formData.append(
        'image',
        image.files[0]
    );

    try {

        const csrftoken =
            getCookie(
                'csrftoken'
            );

        const response =
            await fetch(

                '/admin/gallery/',

                {

                    method: 'POST',

                    headers: {

                        'X-CSRFToken':
                            csrftoken
                    },

                    body: formData
                }
            );

        if (
            response.status === 200
        ) {

            alert(
                'Gallery Image Added Successfully'
            );

            window.closeGalleryModal();

            window.location.reload();

        } else {

            alert(
                'Upload Failed'
            );

            console.log(
                await response.text()
            );
        }

    } catch (error) {

        console.log(
            error
        );

        alert(
            'Something went wrong'
        );
    }
};