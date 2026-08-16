async function deleteReview(id){

    if(!confirm("Delete this review?")){
        return;
    }

    const response = await fetch(
        `/api/reviews/delete/${id}/`,
        {
            method:'POST',
            headers:{
                'X-CSRFToken': getCookie('csrftoken')
            }
        }
    );

    const data = await response.json();

    if(data.status === 'ok'){

        document
            .getElementById(`review-${id}`)
            .remove();

    }

}



async function editReview(id, oldComment, oldRating){

    const newComment = prompt(
        "Edit Comment",
        oldComment
    );

    if(newComment === null){
        return;
    }

    const newRating = prompt(
        "Edit Rating",
        oldRating
    );

    if(newRating === null){
        return;
    }

    const response = await fetch(
        `/api/reviews/update/${id}/`,
        {
            method:'PUT',

            headers:{
                'Content-Type':'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },

            body:JSON.stringify({
                comment:newComment,
                rating:newRating
            })
        }
    );

    const data = await response.json();

    if(data.status === 'ok'){

        location.reload();

    }

}



function getCookie(name){

    let cookieValue = null;

    if(document.cookie && document.cookie !== ''){

        const cookies = document.cookie.split(';');

        for(let i = 0; i < cookies.length; i++){

            const cookie = cookies[i].trim();

            if(cookie.substring(0, name.length + 1)
                === (name + '=')){

                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );

                break;

            }

        }

    }

    return cookieValue;
}