//typewriter effect
$(document).ready(function () {
    const element = $("#typewriterText");
    const text = "A Professional Technology and Smart Software Solutions";
    let i = 0;
    const speed = 100; // Typing speed in milliseconds

    function typeWriter() {
        if (i < text.length) {
            element.html(element.html() + text.charAt(i));
            i++;
            setTimeout(typeWriter, speed);
        } else {
            // Reset and start over after a delay
            setTimeout(function () {
                element.html('');
                i = 0;
                typeWriter();
            }, 2000); // Wait 2 seconds before restarting
        }
    }

    // Start the typewriter effect when document is ready
    typeWriter();
})

// snake card animation

document.addEventListener('DOMContentLoaded', function () {
    const cards = document.querySelectorAll('.single-box');

    cards.forEach(card => {
        // Add border elements
        card.innerHTML += '<div class="border-bottom"></div><div class="border-left"></div>';

        card.addEventListener('mouseenter', () => {
            card.classList.add('snake-border');
            gsap.to(card, {
                scale: 1.02,
                duration: 0.3,
                ease: "power2.out"
            });
        });

        card.addEventListener('mouseleave', () => {
            card.classList.remove('snake-border');
            gsap.to(card, {
                scale: 1,
                duration: 0.3,
                ease: "power2.in"
            });

            // Reset animations by removing and re-adding elements
            const borderBottom = card.querySelector('.border-bottom');
            const borderLeft = card.querySelector('.border-left');
            if (borderBottom) borderBottom.remove();
            if (borderLeft) borderLeft.remove();
            card.innerHTML += '<div class="border-bottom"></div><div class="border-left"></div>';
        });
    });
});